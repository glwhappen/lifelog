import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, aiEnabled, chatWithTools, compactToolResult } from '@/lib/ai';

/** 造一个假的 /chat/completions 响应 */
function mockOnce(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function toolCallResponse(name: string, args: unknown, id = 'c1') {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
        },
      },
    ],
    usage: { total_tokens: 100, prompt_tokens: 90, completion_tokens: 10, prompt_cache_hit_tokens: 0 },
  };
}

function textResponse(content: string) {
  return {
    choices: [{ message: { role: 'assistant', content } }],
    usage: { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10, prompt_cache_hit_tokens: 20 },
  };
}

const TOOLS = [{ name: 'add_task', description: '建待办', parameters: { type: 'object', properties: {} } }];

describe('aiEnabled', () => {
  const orig = process.env.DEEPSEEK_API_KEY;
  afterEach(() => {
    process.env.DEEPSEEK_API_KEY = orig;
    delete process.env.AI_CAPTURE_ENABLED;
  });

  it('没配 key 就关闭（此时前端会自动退回规则分流）', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const mod = await import('@/lib/env');
    vi.spyOn(mod.env, 'deepseekKey', 'get').mockReturnValue('');
    expect(aiEnabled()).toBe(false);
  });
});

describe('chatWithTools —— 模型 → 调工具 → 再决定', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('模型直接回文字（不调工具）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOnce(textResponse('好的'))));
    const r = await chatWithTools({
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
      onToolCall: vi.fn(),
    });
    expect(r.reply).toBe('好的');
    expect(r.rounds).toBe(1);
    expect(r.usage.total).toBe(50);
    expect(r.usage.cacheHit).toBe(20);
  });

  it('模型调工具 → 执行 → 再问一轮拿到回答', async () => {
    const calls: Array<[string, unknown]> = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOnce(toolCallResponse('add_task', { title: '买菜' })))
      .mockResolvedValueOnce(mockOnce(textResponse('记好了')));
    vi.stubGlobal('fetch', fetchMock);

    const r = await chatWithTools({
      messages: [{ role: 'user', content: '买菜' }],
      tools: TOOLS,
      onToolCall: async (name, args) => {
        calls.push([name, args]);
        return '成功';
      },
    });
    expect(calls).toEqual([['add_task', { title: '买菜' }]]);
    expect(r.reply).toBe('记好了');
    expect(r.rounds).toBe(2);
    expect(r.usage.total).toBe(150); // 两轮累加
  });

  it('shouldStopAfterRound 命中时不再多问一轮（省一半 token）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOnce(toolCallResponse('add_task', { title: '买菜' })));
    vi.stubGlobal('fetch', fetchMock);

    const r = await chatWithTools({
      messages: [{ role: 'user', content: '买菜' }],
      tools: TOOLS,
      onToolCall: async () => '成功',
      shouldStopAfterRound: () => true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.rounds).toBe(1);
  });

  it('参数是坏 JSON 时把错误喂回模型，而不是整轮失败', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockOnce({
          choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'add_task', arguments: '{坏掉的' } }] } }],
        }),
      )
      .mockResolvedValueOnce(mockOnce(textResponse('抱歉，重来')));
    vi.stubGlobal('fetch', fetchMock);

    const onToolCall = vi.fn();
    const r = await chatWithTools({
      messages: [{ role: 'user', content: 'x' }],
      tools: TOOLS,
      onToolCall,
    });
    expect(onToolCall).not.toHaveBeenCalled(); // 不该拿坏参数去执行
    expect(r.reply).toBe('抱歉，重来');
  });

  it('工具执行抛错时把错误交给模型，不炸整轮', async () => {
    const fetchMock = vi
      .fn(async (_url: string, _init?: RequestInit) => mockOnce(toolCallResponse('add_task', {})))
      .mockResolvedValueOnce(mockOnce(toolCallResponse('add_task', {})))
      .mockResolvedValueOnce(mockOnce(textResponse('失败了')));
    vi.stubGlobal('fetch', fetchMock);

    const r = await chatWithTools({
      messages: [{ role: 'user', content: 'x' }],
      tools: TOOLS,
      onToolCall: async () => {
        throw new Error('数据库炸了');
      },
    });
    expect(r.reply).toBe('失败了');
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    const toolMsg = secondBody.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.content).toContain('数据库炸了');
  });

  it('轮数上限兜底：模型反复调工具也不会无限循环', async () => {
    const fetchMock = vi.fn(async () => mockOnce(toolCallResponse('add_task', { title: 'x' })));
    vi.stubGlobal('fetch', fetchMock);
    const r = await chatWithTools({
      messages: [{ role: 'user', content: 'x' }],
      tools: TOOLS,
      onToolCall: async () => '又成功',
      maxRounds: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.rounds).toBe(3);
  });

  it('HTTP 错误抛 AiError（带上状态码，便于上层决定降级）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockOnce({ error: { message: '额度不足' } }, false, 402)));
    await expect(
      chatWithTools({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS, onToolCall: vi.fn() }),
    ).rejects.toThrow(/额度不足/);
  });

  it('返回非 JSON 时也不含糊', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>502</html>' }) as unknown as Response),
    );
    await expect(
      chatWithTools({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS, onToolCall: vi.fn() }),
    ).rejects.toBeInstanceOf(AiError);
  });

  it('请求体里带上了关思考的参数（否则 content 会是空的）', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => mockOnce(textResponse('ok')));
    vi.stubGlobal('fetch', fetchMock);
    await chatWithTools({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS, onToolCall: vi.fn() });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.temperature).toBe(0);
    expect(body.tools[0].function.name).toBe('add_task');
  });
});

describe('compactToolResult', () => {
  it('超长结果被截断，避免把大对象原样回灌给模型', () => {
    const big = { rows: Array.from({ length: 500 }, (_, i) => ({ i, t: 'x'.repeat(20) })) };
    const s = compactToolResult(big, 200);
    expect(s.length).toBeLessThanOrEqual(201 + 10);
    expect(s).toContain('已截断');
  });

  it('正常长度原样返回', () => {
    expect(compactToolResult({ ok: true })).toBe('{"ok":true}');
  });
});

describe('sanitizeReply —— 清掉模型回复里的 markdown', () => {
  it('去掉加粗/代码/标题/列表符号（界面按纯文本渲染，留着会显示出星号）', async () => {
    const { sanitizeReply } = await import('@/lib/capture');
    expect(sanitizeReply('你结婚已经 **2337 天** 了')).toBe('你结婚已经 2337 天 了');
    expect(sanitizeReply('__重要__ 的事情')).toBe('重要 的事情');
    expect(sanitizeReply('用 `add_task` 记')).toBe('用 add_task 记');
    expect(sanitizeReply('### 今天\n- 吃饭\n- 睡觉')).toBe('今天\n吃饭\n睡觉');
  });

  it('正常中文不受影响', async () => {
    const { sanitizeReply } = await import('@/lib/capture');
    expect(sanitizeReply('已记录：支出 ¥35（餐饮）')).toBe('已记录：支出 ¥35（餐饮）');
  });

  it('空的还是空', async () => {
    const { sanitizeReply } = await import('@/lib/capture');
    expect(sanitizeReply('')).toBe('');
    expect(sanitizeReply('   ')).toBe('');
  });
});
