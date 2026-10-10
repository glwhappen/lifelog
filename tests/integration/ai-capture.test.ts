/**
 * 集成测试：速记框的 AI 解析（跑真库 + mock 掉模型）。
 * 模型调用一律 mock —— 测试绝不能真的花钱。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasDb, useTestDb, TEST_SUB } from '../helpers/db';
import { createApiKey } from '@/lib/apikey';
import { createTask, listTasks } from '@/lib/tasks';
import { queryEntries, getEntry } from '@/lib/entries';
import { env } from '@/lib/env';
import { POST as capturePOST, GET as captureGET } from '@/app/api/ai/capture/route';
import { CAPTURE_TOOLS, DESTRUCTIVE_TOOLS, captureToolSchemas, describeAction } from '@/lib/capture';
import { todayIn } from '@/lib/dates';

const TZ = 'Asia/Shanghai';

/** 模型返回一次工具调用 */
function toolCall(name: string, args: unknown, content: string | null = null) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content,
              tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
            },
          },
        ],
        usage: { total_tokens: 700, prompt_tokens: 650, completion_tokens: 50 },
      }),
  } as unknown as Response;
}

/** 一次响应里返回多个工具调用（模型确实会这么干） */
function multiToolCall(pairs: Array<[string, unknown]>) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: pairs.map(([name, args], i) => ({
                id: `c${i}`,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              })),
            },
          },
        ],
        usage: { total_tokens: 900 },
      }),
  } as unknown as Response;
}

function plainText(content: string) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 100 } }),
  } as unknown as Response;
}

async function cap(text: string, key: string) {
  const req = new Request('http://life.test/api/ai/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ text }),
  });
  const res = await capturePOST(req);
  return { status: res.status, body: await res.json() };
}

describe('速记工具集（不碰网络）', () => {
  it('暴露的工具都在真实工具表里', async () => {
    const { toolByName } = await import('@/lib/tools');
    for (const n of CAPTURE_TOOLS) {
      expect(toolByName.get(n), `${n} 不在工具表里`).toBeDefined();
    }
  });

  it('schema 齐全且不含读工具 get_day（省 token）', () => {
    const schemas = captureToolSchemas();
    expect(schemas.length).toBe(CAPTURE_TOOLS.length);
    for (const s of schemas) {
      expect(s.description.length).toBeGreaterThan(8);
      expect(s.parameters.type).toBe('object');
    }
    expect(CAPTURE_TOOLS).not.toContain('get_day');
  });

  it('删除类工具被标记为需要确认', () => {
    expect([...DESTRUCTIVE_TOOLS]).toEqual(expect.arrayContaining(['delete_task', 'delete_entry']));
  });

  it('describeAction 对「返回 {ok, task}」的工具也能取到真实字段', () => {
    // 这几个工具返回的不是 Task 本身，曾经导致「顺延到 」后面日期是空的
    expect(describeAction('postpone_task', {}, { ok: true, task: { id: 1, title: '体检', planned_day: '2026-10-12' } })).toBe(
      '顺延「体检」到 2026-10-12',
    );
    expect(describeAction('update_task', {}, { ok: true, task: { id: 1, title: '体检' } })).toBe('修改待办「体检」');
    expect(describeAction('complete_task', {}, { ok: true, task: { id: 1, title: '体检' } })).toBe('完成「体检」');
    expect(describeAction('log_metric', { kind: 'weight', value: 70, unit: 'kg' })).toBe('体重 70kg');
    expect(describeAction('log_metric', { kind: 'energy', value: 2 })).toBe('精力 2');
  });
});

describe.skipIf(!hasDb)('AI 速记（mock 模型）', () => {
  useTestDb();
  afterEach(() => vi.unstubAllGlobals());

  it('GET 暴露 AI 是否就绪', async () => {
    const res = await captureGET();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.enabled).toBe(true);
    expect(body.data.model).toBeTruthy();
  });

  it('自然语言 → 真的建出待办，并带上计划日', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => toolCall('add_task', { title: '给车做保养', planned_day: '明天' })));
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);

    const { status, body } = await cap('记录一下明天要给车做保养', key);
    expect(status).toBe(200);
    expect(body.data.usedAi).toBe(true);
    expect(body.data.reply).toContain('给车做保养');
    expect(body.data.actions).toHaveLength(1);
    expect(body.data.actions[0].ok).toBe(true);

    const tasks = await listTasks(TEST_SUB, TZ, { state: 'pending' });
    expect(tasks.map((t) => t.title)).toEqual(['给车做保养']);
    // 撤销栈：新建的待办 → 删掉它
    expect(body.data.undo).toEqual([{ tool: 'delete_task', args: { task: tasks[0].id } }]);
  });

  it('撤销栈是逆序的（多动作时先撤最后一步）', async () => {
    // 真实模型「一句话两个动作」是在同一次响应里返回两个 tool_calls，
    // 所以要这么 mock（先写一个一次只给一个的 mock，测的就不是真实行为了）
    vi.stubGlobal('fetch', vi.fn(async () => multiToolCall([
      ['log_expense', { amount: 35, category: '餐饮' }],
      ['complete_task', { task: 1 }],
    ])));
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);
    await createTask(TEST_SUB, TZ, { title: '体检', planned_day: '今天' });

    const { body } = await cap('午饭 35，顺便把体检标记完成', key);
    // 第一个动作是记账，第二个是完成；撤销要先撤销「完成」再删流水
    expect(body.data.undo.map((u: any) => u.tool)).toEqual(['update_task', 'delete_entry']);
  });

  it('删除类动作不直接执行，只登记为待确认', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => toolCall('delete_entry', { id: 999 })));
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);

    const { body } = await cap('删掉那条', key);
    expect(body.data.actions).toHaveLength(0);
    expect(body.data.pending).toHaveLength(1);
    expect(body.data.pending[0].tool).toBe('delete_entry');
    expect(body.data.reply).toContain('待确认');
  });

  it('修改已有流水时会记录可回滚的旧值', async () => {
    const { createEntry } = await import('@/lib/entries');
    const e = await createEntry(TEST_SUB, TZ, { kind: 'expense', amount: 22, category: '餐饮', title: '咖啡' });
    vi.stubGlobal('fetch', vi.fn(async () => toolCall('update_entry', { id: e.id, amount: 18 })));
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);

    const { body } = await cap('咖啡其实是 18 不是 22', key);
    expect(body.data.actions[0].ok).toBe(true);
    expect(Number((await getEntry(TEST_SUB, e.id))!.amount)).toBe(18);

    // 撤销 = 用旧值改回去
    const undo = body.data.undo[0];
    expect(undo.tool).toBe('update_entry');
    expect(Number(undo.args.amount)).toBe(22);
  });

  it('模型什么都没调也没说 → 退回规则分流，不让用户白打字', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => plainText('')));
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);

    const { body } = await cap('午饭 35 元', key);
    expect(body.data.usedAi).toBe(false);
    expect(body.data.fallbackRouted).toBe('expense');
    const entries = await queryEntries(TEST_SUB, TZ, { kind: 'expense' });
    expect(entries).toHaveLength(1);
    expect(Number(entries[0].amount)).toBe(35);
  });

  it('模型服务报错 → 同样降级到规则分流（录入这件事不能因为模型挂了就失败）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { message: 'boom' } }) }) as unknown as Response),
    );
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);

    const { status, body } = await cap('跑步 5 公里', key);
    expect(status).toBe(200);
    expect(body.data.usedAi).toBe(false);
    expect(body.data.fallbackRouted).toBe('workout');
    const entries = await queryEntries(TEST_SUB, TZ, { kind: 'workout' });
    expect(entries).toHaveLength(1);
  });

  it('AI 关闭时直接走规则分流', async () => {
    const orig = env.deepseekKey;
    env.deepseekKey = '';
    try {
      const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);
      const { body } = await cap('午饭 35 元', key);
      expect(body.data.usedAi).toBe(false);
      expect(body.data.fallbackRouted).toBe('expense');
    } finally {
      env.deepseekKey = orig;
    }
  });

  it('空内容 / 超长内容被挡住', async () => {
    const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);
    expect((await cap('   ', key)).status).toBe(400);
    expect((await cap('x'.repeat(3000), key)).status).toBe(400);
  });

  it('只读 key 不能调（速记本质是写）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'ro', ['read']);
    expect((await cap('午饭 35', key)).status).toBe(401);
  });

  it('无凭据 → 401', async () => {
    const res = await capturePOST(
      new Request('http://life.test/api/ai/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '午饭 35' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('AI 限流：超过每分钟上限返回 429', async () => {
    const { resetRateLimits } = await import('@/lib/ratelimit');
    resetRateLimits();
    const orig = env.aiRatePerMin;
    env.aiRatePerMin = 2;
    vi.stubGlobal('fetch', vi.fn(async () => plainText('好')));
    try {
      const { key } = await createApiKey(TEST_SUB, 'ai', ['read', 'write']);
      expect((await cap('一', key)).status).toBe(200);
      expect((await cap('二', key)).status).toBe(200);
      expect((await cap('三', key)).status).toBe(429);
    } finally {
      env.aiRatePerMin = orig;
      resetRateLimits();
    }
  });

  it('上下文里带上今天与未完成待办，模型才能理解「那个任务」', async () => {
    const { buildCaptureContext } = await import('@/lib/capture');
    await createTask(TEST_SUB, TZ, { title: '买牛奶', planned_day: '今天' });
    const ctx = await buildCaptureContext({ user: { sub: TEST_SUB, username: 't', timezone: TZ }, scopes: ['read'] });
    expect(ctx).toContain(todayIn(TZ));
    expect(ctx).toContain('买牛奶');
    expect(ctx).toContain('已有习惯');
  });
});
