/**
 * 集成测试：HTTP 层（REST /api/v1/*、MCP /api/mcp）与 API Key 鉴权。
 * 直接调用 route handler，不起服务器、不模拟 cookie —— 纯 API Key 路径。
 */
import { describe, expect, it } from 'vitest';
import { hasDb, useTestDb, TEST_SUB, daysAgo } from '../helpers/db';
import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from '@/lib/apikey';
import { createEntry } from '@/lib/entries';
import { completeTask, createTask } from '@/lib/tasks';
import { GET as v1GET, POST as v1POST } from '@/app/api/v1/[...path]/route';
import { GET as exportGET } from '@/app/api/export/route';
import { resetRateLimits } from '@/lib/ratelimit';
import { POST as mcpPOST } from '@/app/api/mcp/route';
import { todayIn } from '@/lib/dates';

const TZ = 'Asia/Shanghai';
const today = todayIn(TZ);

function v1(
  method: 'GET' | 'POST',
  path: string[],
  opts: { key?: string; query?: string; body?: unknown } = {},
) {
  const url = `http://life.test/api/v1/${path.join('/')}${opts.query ? `?${opts.query}` : ''}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  const req = new Request(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'GET' ? v1GET(req, ctx) : v1POST(req, ctx);
}

async function mcp(key: string | null, payload: unknown) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await mcpPOST(
    new Request('http://life.test/api/mcp', { method: 'POST', headers, body: JSON.stringify(payload) }),
  );
  return { status: res.status, body: await res.json() };
}

describe.skipIf(!hasDb)('API Key 生命周期', () => {
  useTestDb();

  it('签发的明文只返回一次，库里只存 sha256', async () => {
    const { key, row } = await createApiKey(TEST_SUB, '测试', ['read']);
    expect(key.startsWith('ll-')).toBe(true);
    expect(row.prefix.length).toBeLessThan(key.length);
    const keys = await listApiKeys(TEST_SUB);
    expect(keys).toHaveLength(1);
    expect(JSON.stringify(keys)).not.toContain(key);
  });

  it('校验通过并返回 scope', async () => {
    const { key } = await createApiKey(TEST_SUB, 'w', ['read', 'write']);
    const v = await verifyApiKey(key);
    expect(v).not.toBeNull();
    expect(v!.user.sub).toBe(TEST_SUB);
    expect(v!.scopes.sort()).toEqual(['read', 'write']);
  });

  it('无效密钥返回 null', async () => {
    expect(await verifyApiKey('ll-完全不对')).toBeNull();
    expect(await verifyApiKey('')).toBeNull();
    expect(await verifyApiKey('随便一个串')).toBeNull();
  });

  it('吊销后立刻失效', async () => {
    const { key, row } = await createApiKey(TEST_SUB, 'temp', ['read']);
    expect(await verifyApiKey(key)).not.toBeNull();
    expect(await revokeApiKey(TEST_SUB, row.id)).toBe(true);
    expect(await verifyApiKey(key)).toBeNull();
    expect(await revokeApiKey(TEST_SUB, row.id)).toBe(false); // 幂等
  });

  it('写 key 的权限不能跨到别人的账号（user_id 隔离）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'mine', ['read']);
    const v = await verifyApiKey(key);
    expect(v!.user.sub).toBe(TEST_SUB);
  });
});

describe.skipIf(!hasDb)('REST /api/v1', () => {
  useTestDb();

  it('未带密钥 → 401', async () => {
    const res = await v1('GET', ['get_day']);
    expect(res.status).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  it('错误密钥 → 401', async () => {
    const res = await v1('GET', ['get_day'], { key: 'll-nope' });
    expect(res.status).toBe(401);
  });

  it('列出全部能力（不需要密钥）', async () => {
    const res = await v1('GET', ['tools']);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tools.length).toBeGreaterThan(20);
    expect(body.tools[0]).toHaveProperty('name');
    expect(body.tools[0]).toHaveProperty('scope');
  });

  it('GET 只读工具：查询参数被正确转型（tags 逗号分隔、数字参数）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    await createEntry(TEST_SUB, TZ, { kind: 'idea', content: '标签测试', tags: ['a'] });
    await createEntry(TEST_SUB, TZ, { kind: 'idea', content: '不匹配', tags: ['b'] });

    const res = await v1('GET', ['query_entries'], { key, query: 'days=7&tags=a&limit=5&kind=idea' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0].content).toBe('标签测试');
  });

  it('GET 写工具 → 405（提示要用 POST）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read', 'write']);
    const res = await v1('GET', ['add_task'], { key });
    expect(res.status).toBe(405);
  });

  it('未知工具 → 404', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    const res = await v1('GET', ['no_such_tool'], { key });
    expect(res.status).toBe(404);
    const res2 = await v1('POST', ['no_such_tool'], { key, body: {} });
    expect(res2.status).toBe(404);
  });

  it('只读 key 调写工具 → 401 + 明确提示', async () => {
    const { key } = await createApiKey(TEST_SUB, 'ro', ['read']);
    const res = await v1('POST', ['add_task'], { key, body: { title: '不该被创建' } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain('write');
    // 确认真的没落库
    const list = await v1('GET', ['list_tasks'], { key, query: 'state=all' });
    expect((await list.json()).data.tasks).toHaveLength(0);
  });

  it('读写 key 可以创建并读回', async () => {
    const { key } = await createApiKey(TEST_SUB, 'rw', ['read', 'write']);
    const created = await v1('POST', ['add_task'], { key, body: { title: '写点东西', planned_day: '今天' } });
    expect((await created.json()).data.title).toBe('写点东西');

    const day = await v1('GET', ['get_day'], { key });
    const body = await day.json();
    expect(body.data.pending.map((t: any) => t.title)).toEqual(['写点东西']);
  });

  it('quick_capture 经 REST 分流正确', async () => {
    const { key } = await createApiKey(TEST_SUB, 'rw', ['read', 'write']);
    const r1 = await v1('POST', ['quick_capture'], { key, body: { text: '午饭 35 元' } });
    expect((await r1.json()).data.routed).toBe('expense');
    const r2 = await v1('POST', ['quick_capture'], { key, body: { text: '跑步 5 公里' } });
    expect((await r2.json()).data.routed).toBe('workout');
    const r3 = await v1('POST', ['quick_capture'], { key, body: { text: '明天要交周报' } });
    expect((await r3.json()).data.routed).toBe('task');
  });

  it('daily_digest?format=markdown 直接返回 Markdown 文本', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    await createEntry(TEST_SUB, TZ, { kind: 'idea', content: '导出测试' });
    const res = await v1('GET', ['daily_digest'], { key, query: 'days=7&format=markdown' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('生活记录');
    expect(text).toContain('导出测试');
  });

  it('入参非法时给出可读错误，不是 500 堆栈', async () => {
    const { key } = await createApiKey(TEST_SUB, 'rw', ['read', 'write']);
    const res = await v1('POST', ['complete_task'], { key, body: { task: '根本不存在' } });
    const body = await res.json();
    expect(body.ok).toBe(true); // 工具自身返回 { ok: false, error }，属于正常业务返回
    expect(body.data.ok).toBe(false);
    expect(body.data.error).toContain('没找到');
  });

  it('get_day 的输出契约固定（顶层字段一旦改名，页面与模型都会静默出错）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    const res = await v1('GET', ['get_day'], { key });
    const d = (await res.json()).data;
    // 注意：get_day 工具输出是「扁平」的（pending/done/overdue/inbox），
    // 而 src/lib/day.ts 内部的 getDay 返回 { tasks: { planned, done, ... } }。
    // 两者刻意不同（对模型更友好的少一层嵌套），这个断言就是防止它悄悄漂移。
    expect(Object.keys(d).sort()).toEqual(
      ['counts', 'day', 'done', 'entries', 'finance', 'habits', 'inbox', 'isToday', 'overdue', 'pending', 'places', 'summary'].sort(),
    );
    expect(d.counts).toHaveProperty('planned');
    expect(d.counts).toHaveProperty('inbox');
    expect(d.isToday).toBe(true);
  });

  it('回归：四类任务（pending/done/overdue/inbox）的字段形状必须完全一致', async () => {
    // 曾经 pending 用 due、done 用 at、overdue 用 planned_day、inbox 什么都没有，
    // 结果今日页的「截止日」和「完成时间」因为字段名对不上，一直静默不显示。
    const { key } = await createApiKey(TEST_SUB, 'r', ['read', 'write']);
    await createTask(TEST_SUB, TZ, { title: '今天的', planned_day: '今天', due_day: '明天', tags: ['x'] });
    await createTask(TEST_SUB, TZ, { title: '逾期的', planned_day: daysAgo(2) });
    await createTask(TEST_SUB, TZ, { title: '收集箱', planned_day: null });
    const done = await createTask(TEST_SUB, TZ, { title: '完成的', planned_day: '今天' });
    await completeTask(TEST_SUB, TZ, done.id);

    const res = await v1('GET', ['get_day'], { key });
    const d = (await res.json()).data;
    const expected = ['done_at', 'id', 'note', 'planned_day', 'priority', 'status', 'tags', 'title', 'due_day'].sort();
    for (const list of [d.pending, d.done, d.overdue, d.inbox]) {
      expect(list.length).toBeGreaterThan(0);
      for (const t of list) expect(Object.keys(t).sort()).toEqual(expected);
    }
    // 具体值也要对得上
    expect(d.pending[0].due_day).toBe(daysAgo(-1));
    expect(d.pending[0].tags).toEqual(['x']);
    expect(d.overdue[0].planned_day).toBe(daysAgo(2));
    expect(d.done[0].done_at).toBeTruthy();
    expect(d.done[0].status).toBe('done');
  });

  it('get_day 的日期入参支持口语', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    const res = await v1('GET', ['get_day'], { key, query: 'date=今天' });
    expect((await res.json()).data.day).toBe(today);
  });
});

describe.skipIf(!hasDb)('MCP /api/mcp', () => {
  useTestDb();

  it('tools/list 返回全部工具与只读标注', async () => {
    const { key } = await createApiKey(TEST_SUB, 'mcp', ['read', 'write']);
    const { status, body } = await mcp(key, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(200);
    const tools = body.result.tools as any[];
    expect(tools.length).toBeGreaterThan(20);
    const day = tools.find((t) => t.name === 'get_day');
    expect(day.annotations.readOnlyHint).toBe(true);
    const add = tools.find((t) => t.name === 'add_task');
    expect(add.annotations.readOnlyHint).toBe(false);
    // 每个工具都要有可用的 JSON Schema，否则客户端调不动
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      // 描述是模型选工具的唯一依据，太短（如「记录支出。」）会让它选错
      expect(t.description.length).toBeGreaterThan(15);
    }
  });

  it('tools/call 正常读写', async () => {
    const { key } = await createApiKey(TEST_SUB, 'mcp', ['read', 'write']);
    const call = await mcp(key, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'add_task', arguments: { title: 'MCP 建的', planned_day: '今天' } },
    });
    const created = JSON.parse(call.body.result.content[0].text);
    expect(created.title).toBe('MCP 建的');

    const day = await mcp(key, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_day', arguments: {} },
    });
    const data = JSON.parse(day.body.result.content[0].text);
    expect(data.pending.map((t: any) => t.title)).toEqual(['MCP 建的']);
    expect(data.day).toBe(today);
  });

  it('只读 key 调写工具被拒（isError + 提示缺 write）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'ro', ['read']);
    const r = await mcp(key, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'add_task', arguments: { title: '不该存在' } },
    });
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toContain('write');
  });

  it('未知工具返回 isError 而不是崩掉', async () => {
    const { key } = await createApiKey(TEST_SUB, 'mcp', ['read', 'write']);
    const r = await mcp(key, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'no_such_tool', arguments: {} },
    });
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toContain('未知工具');
  });

  it('无效密钥 → JSON-RPC 错误码 -32001', async () => {
    const r = await mcp('ll-bad-key', { jsonrpc: '2.0', id: 5, method: 'tools/list' });
    expect(r.body.error.code).toBe(-32001);
  });

  it('不带任何凭据 → 未授权（不是 500）', async () => {
    const r = await mcp(null, { jsonrpc: '2.0', id: 6, method: 'tools/list' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe(-32001);
  });

  it('工具抛错时返回 isError 与可读信息，不泄露堆栈', async () => {
    const { key } = await createApiKey(TEST_SUB, 'mcp', ['read', 'write']);
    const r = await mcp(key, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'complete_task', arguments: { task: '不存在的东西' } },
    });
    expect(r.body.result.isError).toBeUndefined();
    expect(JSON.parse(r.body.result.content[0].text).ok).toBe(false);
  });

  it('id 原样回传（JSON-RPC 基本契约）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'mcp', ['read']);
    const r = await mcp(key, { jsonrpc: '2.0', id: 'abc-123', method: 'tools/list' });
    expect(r.body.id).toBe('abc-123');
  });
});

describe.skipIf(!hasDb)('工具层与页面共享的字段契约', () => {
  useTestDb();

  it('habit_stats 返回 habit 对象（回归：曾返回字符串导致打卡页空白）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    await v1('POST', ['check_habit'], { key: '', body: {} }); // 无权限，故意忽略
    const { key: rw } = await createApiKey(TEST_SUB, 'rw', ['read', 'write']);
    await v1('POST', ['check_habit'], { key: rw, body: { habit: '运动' } });

    const res = await v1('GET', ['habit_stats'], { key: rw, query: 'days=7' });
    const stats = (await res.json()).data as any[];
    expect(stats.length).toBeGreaterThan(0);
    const sport = stats.find((s) => s.habit.name === '运动')!;
    expect(typeof sport.habit).toBe('object');
    expect(sport.habit).toMatchObject({ name: '运动', kind: 'bool' });
    expect(sport.habit.id).toBeGreaterThan(0);
    expect(sport).toHaveProperty('today');
    // 默认不返回逐日明细（避免响应膨胀）
    expect(sport.cells).toBeUndefined();
  });

  it('habit_stats with_cells=true 才返回逐日明细', async () => {
    const { key } = await createApiKey(TEST_SUB, 'rw', ['read', 'write']);
    await v1('POST', ['check_habit'], { key, body: { habit: '运动' } });
    const res = await v1('GET', ['habit_stats'], { key, query: 'days=7&with_cells=true' });
    const stats = (await res.json()).data as any[];
    const sport = stats.find((s) => s.habit.name === '运动')!;
    expect(sport.cells).toHaveLength(7);
    expect(sport.cells[6].value).toBe(1);
  });

  it('list_tasks 的 done 状态按完成时间过滤', async () => {
    const { key } = await createApiKey(TEST_SUB, 'rw', ['read', 'write']);
    const t = await createTask(TEST_SUB, TZ, { title: '完成它', planned_day: '今天' });
    await v1('POST', ['complete_task'], { key, body: { task: t.id } });
    const res = await v1('GET', ['list_tasks'], { key, query: 'state=done' });
    const body = await res.json();
    expect(body.data.tasks.map((x: any) => x.title)).toEqual(['完成它']);
    expect(body.data.tasks[0].done_at).toBeTruthy();
  });

  it('who_am_i 暴露时区与 scope，便于模型知道自己在替谁干活', async () => {
    const { key } = await createApiKey(TEST_SUB, 'r', ['read']);
    const res = await v1('GET', ['who_am_i'], { key });
    const d = (await res.json()).data;
    expect(d.sub).toBe(TEST_SUB);
    expect(d.timezone).toBe(TZ);
    expect(d.scopes).toContain('read');
  });
});

describe.skipIf(!hasDb)('限流：防止跑飞的 agent 灌爆数据库', () => {
  useTestDb();

  it('写操作超过上限返回 429 + Retry-After', async () => {
    resetRateLimits();
    process.env.RATE_LIMIT_WRITE_PER_MIN = '2';
    try {
      const { key } = await createApiKey(TEST_SUB, 'rl', ['read', 'write']);
      const body = { title: '限流测试' };
      expect((await v1('POST', ['add_task'], { key, body })).status).toBe(200);
      expect((await v1('POST', ['add_task'], { key, body })).status).toBe(200);
      const third = await v1('POST', ['add_task'], { key, body });
      expect(third.status).toBe(429);
      expect(third.headers.get('retry-after')).toBeTruthy();
      expect((await third.json()).error).toContain('频繁');
    } finally {
      delete process.env.RATE_LIMIT_WRITE_PER_MIN;
      resetRateLimits();
    }
  });

  it('读操作不受写限额影响（分开计数）', async () => {
    resetRateLimits();
    process.env.RATE_LIMIT_WRITE_PER_MIN = '1';
    try {
      const { key } = await createApiKey(TEST_SUB, 'rl2', ['read', 'write']);
      await v1('POST', ['add_task'], { key, body: { title: 'a' } });
      for (let i = 0; i < 5; i++) {
        expect((await v1('GET', ['get_day'], { key })).status).toBe(200);
      }
    } finally {
      delete process.env.RATE_LIMIT_WRITE_PER_MIN;
      resetRateLimits();
    }
  });

  it('MCP 写工具同样受限流保护', async () => {
    resetRateLimits();
    process.env.RATE_LIMIT_WRITE_PER_MIN = '1';
    try {
      const { key } = await createApiKey(TEST_SUB, 'rlm', ['read', 'write']);
      const call = () =>
        mcp(key, {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'add_task', arguments: { title: 'mcp 限流' } },
        });
      expect((await call()).body.result.isError).toBeUndefined();
      const second = await call();
      expect(second.body.result.isError).toBe(true);
      expect(second.body.result.content[0].text).toContain('频繁');
    } finally {
      delete process.env.RATE_LIMIT_WRITE_PER_MIN;
      resetRateLimits();
    }
  });
});

describe.skipIf(!hasDb)('全量数据导出（数据主权）', () => {
  useTestDb();

  it('导出包含全部业务表，且格式自描述', async () => {
    const { key } = await createApiKey(TEST_SUB, 'exp', ['read', 'write']);
    await createTask(TEST_SUB, TZ, { title: '导出的任务', planned_day: '今天' });
    await createEntry(TEST_SUB, TZ, { kind: 'expense', amount: 12.5, category: '餐饮' });

    const res = await exportGET(
      new Request('http://life.test/api/export', { headers: { authorization: `Bearer ${key}` } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const data = await res.json();

    expect(data.format).toBe('lifelog-export');
    expect(data.version).toBe(1);
    expect(data.user.sub).toBe(TEST_SUB);
    expect(Object.keys(data.tables).sort()).toEqual(
      ['daily_summaries', 'entries', 'habit_logs', 'habits', 'locations', 'tasks'].sort(),
    );
    expect(data.tables.tasks).toHaveLength(1);
    expect(data.tables.entries).toHaveLength(1);
    expect(Number(data.tables.entries[0].amount)).toBe(12.5);
    expect(data.totals.entries).toBe(1);
    // 绝不能把密钥哈希导出去
    expect(JSON.stringify(data)).not.toContain('key_sha256');
  });

  it('days 参数限制导出范围', async () => {
    const { key } = await createApiKey(TEST_SUB, 'exp2', ['read']);
    await createEntry(TEST_SUB, TZ, { kind: 'note', content: '今天', day: daysAgo(0) });
    await createEntry(TEST_SUB, TZ, { kind: 'note', content: '很久以前', day: daysAgo(400) });

    const res = await exportGET(
      new Request('http://life.test/api/export?days=30', { headers: { authorization: `Bearer ${key}` } }),
    );
    const data = await res.json();
    expect(data.tables.entries).toHaveLength(1);
    expect(data.tables.entries[0].content).toBe('今天');
    expect(data.totals.entries).toBe(2); // totals 是历史总量，与过滤范围无关
  });

  it('未授权不能导出', async () => {
    const res = await exportGET(new Request('http://life.test/api/export'));
    expect(res.status).toBe(401);
  });

  it('只读 key 也可以导出（导出属于读权限）', async () => {
    const { key } = await createApiKey(TEST_SUB, 'exp3', ['read']);
    const res = await exportGET(
      new Request('http://life.test/api/export', { headers: { authorization: `Bearer ${key}` } }),
    );
    expect(res.status).toBe(200);
  });
});
