import type { SessionUser } from './auth';
import type { Scope } from './apikey';
import { normDay, resolveRange, shiftDay, todayIn } from './dates';
import { createEntry, deleteEntry, queryEntries, updateEntry } from './entries';
import { createTask, completeTask, deleteTask, findTask, listTasks, postponeTask, updateTask } from './tasks';
import { checkHabit, deleteHabit, findHabit, habitStats, listHabits, uncheckHabit, upsertHabit, ensureDefaultHabits } from './habits';
import { addLocation, listLocations, reverseGeocode, trackStats } from './locations';
import { financeSummary, frequentCategories } from './finance';
import { overview } from './stats';
import { getDay, loggingStreak, saveSummary } from './day';
import { digest } from './digest';
import { one } from './db';

/**
 * 工具层：REST(/api/v1/*) 与 MCP(/api/mcp) 共用同一份定义。
 * 一处新增 = 网页、REST、大模型三边同时可用。
 */
export interface ToolCtx {
  user: SessionUser;
  scopes: Scope[];
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  scope: 'read' | 'write';
  inputSchema: Record<string, any>; // JSON Schema
  handler: (ctx: ToolCtx, args: any) => Promise<unknown>;
}

const tz = (ctx: ToolCtx) => ctx.user.timezone || 'Asia/Shanghai';
const uid = (ctx: ToolCtx) => ctx.user.sub;

/* ---------------------------------------------------------------- 读工具 */

function readTools(): ToolDef[] {
  return [
    {
      name: 'get_day',
      title: '看某一天的全貌',
      description:
        '获取指定日期（默认今天）的完整生活快照：待办/已完成/逾期、各类流水（灵感、笔记、收支、心情、健康）、习惯打卡、到过的地方、当日总结。回答「我今天做了什么/现在什么状态」时优先用它。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: { date: { type: 'string', description: 'YYYY-MM-DD，也接受 今天/昨天/前天/明天' } },
      },
      handler: async (ctx, a) => {
        const day = a.date ? normDay(String(a.date), tz(ctx)) : todayIn(tz(ctx));
        const d = await getDay(uid(ctx), tz(ctx), day);
        return {
          day: d.day,
          pending: d.tasks.planned.map((t) => ({ id: t.id, title: t.title, priority: t.priority, due: t.due_day })),
          done: d.tasks.done.map((t) => ({ id: t.id, title: t.title, at: t.done_at })),
          overdue: d.tasks.overdue.map((t) => ({ id: t.id, title: t.title, planned_day: t.planned_day })),
          inbox: d.tasks.inbox.map((t) => ({ id: t.id, title: t.title })),
          counts: d.tasks.counts,
          entries: d.entries,
          habits: d.habits,
          finance: {
            expense: d.finance.expense,
            income: d.finance.income,
            items: d.finance.items.map((e) => ({
              id: e.id,
              kind: e.kind,
              day: e.day,
              happened_at: e.happened_at,
              title: e.title,
              content: e.content,
              amount: e.amount,
              category: e.category,
            })),
          },
          places: d.locations,
          summary: d.summary,
        };
      },
    },
    {
      name: 'query_entries',
      title: '检索生活流水',
      description:
        '按类型/时间/关键词/标签检索流水。kind 可选：done idea note expense income mood energy sleep weight water workout focus reading gratitude dream social weather location metric。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: '单个类型，多个用逗号分隔' },
          from: { type: 'string' },
          to: { type: 'string' },
          days: { type: 'number', description: '最近 N 天' },
          range: { type: 'string', enum: ['today', 'yesterday', 'week', 'month', 'year'] },
          q: { type: 'string', description: '内容关键词' },
          tags: { type: 'array', items: { type: 'string' } },
          category: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      handler: async (ctx, a) => {
        const rows = await queryEntries(uid(ctx), tz(ctx), {
          ...a,
          kind: a.kind ? String(a.kind).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
        });
        return { count: rows.length, entries: rows };
      },
    },
    {
      name: 'list_tasks',
      title: '查待办',
      description:
        '列出任务。state: pending 未完成 / today 今天计划 / overdue 逾期 / done 已完成 / all 全部。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['pending', 'today', 'overdue', 'done', 'cancelled', 'all'] },
          from: { type: 'string' },
          to: { type: 'string' },
          days: { type: 'number' },
          q: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' },
        },
      },
      handler: async (ctx, a) => {
        const rows = await listTasks(uid(ctx), tz(ctx), a);
        return { count: rows.length, tasks: rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, planned_day: t.planned_day, due_day: t.due_day, done_at: t.done_at, tags: t.tags, note: t.note })) };
      },
    },
    {
      name: 'finance_summary',
      title: '收支汇总',
      description: '按区间统计支出/收入总额、分类构成、逐日与逐月趋势、最大支出。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, days: { type: 'number' }, range: { type: 'string', enum: ['today', 'week', 'month', 'year'] } },
      },
      handler: async (ctx, a) => financeSummary(uid(ctx), tz(ctx), a),
    },
    {
      name: 'habit_stats',
      title: '习惯打卡统计',
      description: '每个习惯的打卡明细、完成率、当前连续天数与最长连续天数。with_cells=true 时额外返回逐日打卡明细。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          days: { type: 'number' },
          range: { type: 'string', enum: ['today', 'week', 'month', 'year'] },
          with_cells: { type: 'boolean', description: '是否返回逐日明细（数据量大，默认 false）' },
        },
      },
      handler: async (ctx, a) => {
        const stats = await habitStats(uid(ctx), tz(ctx), a);
        return stats.map((s) => ({
          habit: {
            id: s.habit.id,
            name: s.habit.name,
            icon: s.habit.icon,
            kind: s.habit.kind,
            target: s.habit.target,
            unit: s.habit.unit,
          },
          doneDays: s.doneDays,
          totalDays: s.totalDays,
          rate: Math.round(s.rate * 1000) / 1000,
          currentStreak: s.currentStreak,
          longestStreak: s.longestStreak,
          today: s.cells[s.cells.length - 1]?.value ?? 0,
          ...(a.with_cells ? { cells: s.cells } : {}),
        }));
      },
    },
    {
      name: 'list_habits',
      title: '习惯清单',
      description: '列出全部习惯（含计数型的目标值）。',
      scope: 'read',
      inputSchema: { type: 'object', properties: {} },
      handler: async (ctx) => {
        const h = await ensureDefaultHabits(uid(ctx));
        return h.map((x) => ({ id: x.id, name: x.name, icon: x.icon, kind: x.kind, target: x.target, unit: x.unit, active: x.active }));
      },
    },
    {
      name: 'stats_overview',
      title: '综合统计',
      description: '一段时间的综合概览：记录活跃度、类型分布、任务完成率、收支、习惯完成率、体重/睡眠/心情等指标趋势、标签云。做周报/月报时用它。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, days: { type: 'number', description: '默认 30' }, range: { type: 'string', enum: ['week', 'month', 'year'] } },
      },
      handler: async (ctx, a) => overview(uid(ctx), tz(ctx), a.days || a.from || a.range ? a : { days: 30 }),
    },
    {
      name: 'daily_digest',
      title: '生活摘要（Markdown）',
      description:
        '把一段时间的生活导出成紧凑 Markdown，适合直接阅读或写周报。默认最近 7 天。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, days: { type: 'number' }, range: { type: 'string', enum: ['week', 'month'] }, max_days: { type: 'number', description: '最多展开多少天，默认 7' } },
      },
      handler: async (ctx, a) => ({
        markdown: await digest(uid(ctx), tz(ctx), a.days || a.from || a.range ? a : { days: 7 }, { days: a.max_days ?? 7 }),
      }),
    },
    {
      name: 'list_locations',
      title: '位置轨迹',
      description: '按区间读取定位点，并给出总里程。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, days: { type: 'number' }, range: { type: 'string', enum: ['today', 'week', 'month'] }, limit: { type: 'number' } },
      },
      handler: async (ctx, a) => {
        const points = await listLocations(uid(ctx), tz(ctx), a.days || a.from || a.range ? a : { days: 1 });
        return { track: trackStats(points), points };
      },
    },
    {
      name: 'search_all',
      title: '全局搜索',
      description: '在流水与待办里同时按关键词搜索，用于「我上次提到 X 是什么时候」。',
      scope: 'read',
      inputSchema: {
        type: 'object',
        properties: { q: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, days: { type: 'number' }, limit: { type: 'number' } },
        required: ['q'],
      },
      handler: async (ctx, a) => {
        const [entries, tasks] = await Promise.all([
          queryEntries(uid(ctx), tz(ctx), { q: a.q, from: a.from, to: a.to, days: a.days, limit: a.limit ?? 50 }),
          listTasks(uid(ctx), tz(ctx), { q: a.q, state: 'all', limit: a.limit ?? 50 }),
        ]);
        return { entries, tasks };
      },
    },
    {
      name: 'who_am_i',
      title: '当前用户',
      description: '当前身份、时区、连续记录天数，以及可用的 AI 接入信息。',
      scope: 'read',
      inputSchema: { type: 'object', properties: {} },
      handler: async (ctx) => ({
        sub: ctx.user.sub,
        username: ctx.user.username,
        name: ctx.user.name,
        timezone: tz(ctx),
        scopes: ctx.scopes,
        loggingStreak: await loggingStreak(uid(ctx), tz(ctx)),
      }),
    },
  ];
}

/* ---------------------------------------------------------------- 写工具 */

function writeTools(): ToolDef[] {
  return [
    {
      name: 'add_task',
      title: '新建待办',
      description: '新建一条待办。planned_day 默认今天；不传 planned_day 会进「收集箱」。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          note: { type: 'string' },
          planned_day: { type: 'string', description: 'YYYY-MM-DD 或 今天/明天/周一' },
          due_day: { type: 'string' },
          priority: { type: 'number', description: '0 普通 1 重要 2 紧急' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
      },
      handler: async (ctx, a) => createTask(uid(ctx), tz(ctx), a),
    },
    {
      name: 'complete_task',
      title: '完成任务',
      description: '把任务标记为完成（支持传 id 或标题关键词），同时写入当天完成流水。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string', description: '任务 id 或标题关键词' }, day: { type: 'string' }, note: { type: 'string' } },
        required: ['task'],
      },
      handler: async (ctx, a) => {
        const r = await completeTask(uid(ctx), tz(ctx), a.task, { day: a.day, note: a.note, source: 'mcp' });
        if (!r) return { ok: false, error: `没找到未完成任务：${a.task}` };
        return { ok: true, task: { id: r.task.id, title: r.task.title, done_at: r.task.done_at } };
      },
    },
    {
      name: 'update_task',
      title: '修改待办',
      description: '修改任务标题/备注/计划日/截止日/优先级/标签/状态。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          title: { type: 'string' },
          note: { type: 'string' },
          planned_day: { type: 'string' },
          due_day: { type: 'string' },
          priority: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['pending', 'done', 'cancelled'] },
        },
        required: ['task'],
      },
      handler: async (ctx, a) => {
        const { task, ...patch } = a;
        const r = await updateTask(uid(ctx), tz(ctx), task, patch);
        return r ? { ok: true, task: r } : { ok: false, error: `没找到任务：${task}` };
      },
    },
    {
      name: 'postpone_task',
      title: '顺延待办',
      description: '把未完成任务顺延到指定日期（默认明天）。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string' }, to_day: { type: 'string' } },
        required: ['task'],
      },
      handler: async (ctx, a) => {
        const r = await postponeTask(uid(ctx), tz(ctx), a.task, a.to_day);
        return r ? { ok: true, task: r } : { ok: false, error: `没找到任务：${a.task}` };
      },
    },
    {
      name: 'delete_task',
      title: '删除待办',
      description: '软删除任务（同时隐藏它的完成流水）。',
      scope: 'write',
      inputSchema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
      handler: async (ctx, a) => ({ ok: await deleteTask(uid(ctx), a.task) }),
    },
    {
      name: 'add_idea',
      title: '记灵感',
      description: '快速记一条灵感/闪念，一句话即可。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, day: { type: 'string' }, at: { type: 'string', description: 'HH:mm' } },
        required: ['content'],
      },
      handler: async (ctx, a) => createEntry(uid(ctx), tz(ctx), { kind: 'idea', content: a.content, tags: a.tags, day: a.day, at: a.at, source: 'mcp' }),
    },
    {
      name: 'add_note',
      title: '记笔记/总结',
      description: '记录一段文本：当天总结、随想、会议纪要、日记。支持 markdown。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { content: { type: 'string' }, title: { type: 'string' }, day: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        required: ['content'],
      },
      handler: async (ctx, a) => createEntry(uid(ctx), tz(ctx), { kind: 'note', title: a.title, content: a.content, tags: a.tags, day: a.day, source: 'mcp' }),
    },
    {
      name: 'log_expense',
      title: '记一笔支出',
      description: '记录支出。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { amount: { type: 'number' }, category: { type: 'string', description: '餐饮/交通/购物…' }, note: { type: 'string' }, day: { type: 'string' }, at: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        required: ['amount'],
      },
      handler: async (ctx, a) => createEntry(uid(ctx), tz(ctx), { kind: 'expense', amount: Number(a.amount), title: a.note, category: a.category, day: a.day, at: a.at, tags: a.tags, source: 'mcp' }),
    },
    {
      name: 'log_income',
      title: '记一笔收入',
      description: '记录收入。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { amount: { type: 'number' }, category: { type: 'string' }, note: { type: 'string' }, day: { type: 'string' }, at: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        required: ['amount'],
      },
      handler: async (ctx, a) => createEntry(uid(ctx), tz(ctx), { kind: 'income', amount: Number(a.amount), title: a.note, category: a.category, day: a.day, at: a.at, tags: a.tags, source: 'mcp' }),
    },
    {
      name: 'check_habit',
      title: '习惯打卡',
      description:
        '给习惯打卡。bool 型重复打卡幂等；count 型默认 +1，可用 value 指定增量、set=true 直接设为某值。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          habit: { type: 'string', description: '习惯名或 id' },
          day: { type: 'string' },
          value: { type: 'number' },
          set: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['habit'],
      },
      handler: async (ctx, a) => {
        const r = await checkHabit(uid(ctx), tz(ctx), a.habit, { day: a.day, value: a.value, set: a.set, note: a.note });
        if (!r) return { ok: false, error: `没有这个习惯：${a.habit}（可以用 list_habits 看清单）` };
        return { ok: true, habit_id: r.habit_id, day: r.day, value: r.value };
      },
    },
    {
      name: 'uncheck_habit',
      title: '取消打卡',
      description: '撤销某天的习惯打卡。',
      scope: 'write',
      inputSchema: { type: 'object', properties: { habit: { type: 'string' }, day: { type: 'string' } }, required: ['habit'] },
      handler: async (ctx, a) => ({ ok: await uncheckHabit(uid(ctx), a.habit, a.day, tz(ctx)) }),
    },
    {
      name: 'add_habit',
      title: '新增/修改习惯',
      description: '新增一个习惯，或按名称覆盖已有习惯的配置。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          icon: { type: 'string' },
          kind: { type: 'string', enum: ['bool', 'count'] },
          target: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name'],
      },
      handler: async (ctx, a) => upsertHabit(uid(ctx), a),
    },
    {
      name: 'delete_habit',
      title: '删除习惯',
      description: '删除一个习惯（连带其打卡记录）。',
      scope: 'write',
      inputSchema: { type: 'object', properties: { habit: { type: 'string' } }, required: ['habit'] },
      handler: async (ctx, a) => ({ ok: await deleteHabit(uid(ctx), a.habit) }),
    },
    {
      name: 'log_metric',
      title: '记录数值指标',
      description:
        '记录体重/睡眠/饮水/心情/精力/专注时长/运动时长等数值。kind 建议用：weight sleep water mood energy focus workout reading。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string', description: '如 kg / 小时 / 杯 / 分' },
          day: { type: 'string' },
          at: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['kind', 'value'],
      },
      handler: async (ctx, a) =>
        createEntry(uid(ctx), tz(ctx), {
          kind: a.kind,
          amount: Number(a.value),
          category: a.unit ?? null,
          content: a.note,
          day: a.day,
          at: a.at,
          source: 'mcp',
          meta: { unit: a.unit ?? null },
        }),
    },
    {
      name: 'log_location',
      title: '记录位置',
      description: '记录当前或某个位置。有经纬度就会自动尝试解析地名（未配置逆地理服务时只存坐标）。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          place_name: { type: 'string' },
          city: { type: 'string' },
          accuracy: { type: 'number' },
          day: { type: 'string' },
        },
        required: ['lat', 'lng'],
      },
      handler: async (ctx, a) => {
        let geo = null;
        if (!a.place_name && !a.city) geo = await reverseGeocode(a.lat, a.lng);
        return addLocation(uid(ctx), tz(ctx), { ...a, ...(geo ?? {}), source: 'mcp' });
      },
    },
    {
      name: 'save_summary',
      title: '写当天总结',
      description: '写/更新某天的手写总结，并记录心情与精力（1-5）。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { day: { type: 'string' }, summary: { type: 'string' }, mood: { type: 'number' }, energy: { type: 'number' } },
      },
      handler: async (ctx, a) => saveSummary(uid(ctx), tz(ctx), a),
    },
    {
      name: 'update_entry',
      title: '修改流水',
      description: '修改一条流水的内容/金额/分类/标签。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          content: { type: 'string' },
          amount: { type: 'number' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
      handler: async (ctx, a) => {
        const { id, ...patch } = a;
        const r = await updateEntry(uid(ctx), id, patch);
        return r ? { ok: true, entry: r } : { ok: false, error: `没找到流水 #${id}` };
      },
    },
    {
      name: 'delete_entry',
      title: '删除流水',
      description: '软删除一条流水。',
      scope: 'write',
      inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      handler: async (ctx, a) => ({ ok: await deleteEntry(uid(ctx), a.id) }),
    },
    {
      name: 'quick_capture',
      title: '一句话速记（智能分流）',
      description:
        '把一句自然语言自动分流成对应记录。例如「午饭 35」→支出；「买了牛奶」→完成；「跑步 5 公里」→运动；「明天要交周报」→待办。适合语音/聊天窗口直接丢一句话进来。',
      scope: 'write',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, day: { type: 'string' } },
        required: ['text'],
      },
      handler: async (ctx, a) => quickCapture(ctx, String(a.text), a.day),
    },
  ];
}

/**
 * 规则式速记分流：不调模型，零成本、可预测。
 * 复杂的语义理解交给调用方的大模型（它调 add_task / log_expense 更准）。
 */
export async function quickCapture(ctx: ToolCtx, text: string, day?: string) {
  const t = text.trim();
  const u = uid(ctx);
  const tzz = tz(ctx);
  const dayHint = day ? normDay(day, tzz) : extractDay(t, tzz);

  // 1) 金额 → 支出 / 收入
  const amount = extractAmount(t);
  if (amount !== null) {
    const isIncome = /(?:收入|收到|进账|报销|工资|奖金|红包|退款|赚了|卖出)/.test(t);
    const entry = await createEntry(u, tzz, {
      kind: isIncome ? 'income' : 'expense',
      amount,
      title: t,
      category: isIncome ? undefined : categorize(t),
      day: dayHint,
      source: 'mcp',
    });
    return { routed: isIncome ? 'income' : 'expense', entry };
  }

  // 2) 数值指标
  const metric = parseMetric(t);
  if (metric) {
    const entry = await createEntry(u, tzz, {
      kind: metric.kind,
      amount: metric.value,
      category: metric.unit,
      content: t,
      day: dayHint,
      source: 'mcp',
      meta: { unit: metric.unit },
    });
    return { routed: metric.kind, entry };
  }

  // 3) 待办意图
  if (/(?:要|需要|记得|别忘|待办|提醒我|安排)/.test(t)) {
    const task = await createTask(u, tzz, { title: t, planned_day: dayHint, source: 'mcp' });
    return { routed: 'task', task };
  }

  // 4) 灵感 / 完成 / 笔记
  if (/(?:想法|灵感|点子|idea)/i.test(t)) {
    const entry = await createEntry(u, tzz, { kind: 'idea', content: t, day: dayHint, source: 'mcp' });
    return { routed: 'idea', entry };
  }
  if (/(?:完成|做完了|搞定了|已完成|做完了|收工)/.test(t)) {
    const entry = await createEntry(u, tzz, { kind: 'done', title: t, day: dayHint, source: 'mcp' });
    return { routed: 'done', entry };
  }

  const entry = await createEntry(u, tzz, { kind: 'note', content: t, day: dayHint, source: 'mcp' });
  return { routed: 'note', entry };
}

/** 从一句话里抽金额：只认有货币标记的（避免把「跑步 5 公里」当花钱） */
function extractAmount(text: string): number | null {
  let m = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块|人民币|圆)/);
  if (!m) m = text.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) m = text.match(/(?:花了|付了|付|充了|充值|收到|买了)\D{0,4}?(\d+(?:\.\d{1,2})?)(?!\s*(?:公里|km|千克|公斤|kg|分钟|小时|杯))/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 抽一句话里的日期（今天/明天/后天/下周X/周X/3月5日），抽不到返回 undefined */
function extractDay(text: string, tzz: string): string | undefined {
  const today = todayIn(tzz);
  const table: Array<[RegExp, number]> = [
    [/今天|今日/, 0],
    [/明天|明日/, 1],
    [/后天/, 2],
    [/大后天/, 3],
    [/昨天|昨日/, -1],
    [/前天/, -2],
  ];
  for (const [re, delta] of table) {
    if (re.test(text)) return shiftDay(today, delta);
  }
  const nextWeek = /下周/.test(text);
  const w = text.match(/周([一二三四五六日天])/);
  if (w) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const cur = new Date(`${today}T12:00:00Z`).getUTCDay();
    let delta = (map[w[1]] - cur + 7) % 7;
    if (nextWeek) delta += 7;
    return shiftDay(today, delta);
  }
  const md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (md) {
    const year = today.slice(0, 4);
    const p = (n: string) => n.padStart(2, '0');
    return `${year}-${p(md[1])}-${p(md[2])}`;
  }
  return undefined;
}

function parseMetric(text: string): { kind: string; value: number; unit?: string } | null {
  let m = text.match(/(?:体重|称了?重?)\D{0,4}?(\d+(?:\.\d+)?)\s*(kg|公斤|斤)?/);
  if (m) return { kind: 'weight', value: Number(m[1]), unit: m[2] === '斤' ? '斤' : 'kg' };
  m = text.match(/(?:睡了?|睡眠时间?)\D{0,3}?(\d+(?:\.\d+)?)\s*(?:小时|个小时|h|个钟)/);
  if (m) return { kind: 'sleep', value: Number(m[1]), unit: '小时' };
  m = text.match(/(?:喝水|喝了|饮水|补水)\D{0,3}?(\d+(?:\.\d+)?)\s*(杯|ml|毫升)/);
  if (m) return { kind: 'water', value: Number(m[1]), unit: m[2] === 'ml' ? 'ml' : m[2] };
  m = text.match(/(?:跑步|跑了|走了|步行|骑车|骑行|游泳|爬楼|登山|健身|运动)\D{0,3}?(\d+(?:\.\d+)?)\s*(公里|km|千米)/i);
  if (m) return { kind: 'workout', value: Number(m[1]), unit: 'km' };
  m = text.match(/(?:跑步|跑了|走了|步行|骑车|骑行|游泳|健身|运动|练了?)\D{0,3}?(\d+)\s*(?:分钟|min)/i);
  if (m) return { kind: 'workout', value: Number(m[1]), unit: '分钟' };
  m = text.match(/(?:专注|番茄钟?|工作|学习)\D{0,3}?(\d+)\s*(?:分钟|min)/i);
  if (m) return { kind: 'focus', value: Number(m[1]), unit: '分钟' };
  m = text.match(/(?:看书|阅读)\D{0,3}?(\d+)\s*(?:分钟|min|页)/i);
  if (m) return { kind: 'reading', value: Number(m[1]), unit: /页/.test(text) ? '页' : '分钟' };
  m = text.match(/心情\s*([1-5])\s*(?:\/5)?/);
  if (m) return { kind: 'mood', value: Number(m[1]), unit: '/5' };
  return null;
}

function categorize(text: string): string {
  const rules: Array<[RegExp, string]> = [
    [/早餐|午饭|午饭|午餐|晚饭|晚餐|吃饭|外卖|奶茶|咖啡|夜宵|餐厅|火锅/, '餐饮'],
    [/打车|滴滴|地铁|公交|高铁|火车|机票|油费|加油|停车|过路费/, '交通'],
    [/房租|水费|电费|燃气|物业|宽带|话费|流量/, '居住'],
    [/衣服|鞋|数码|手机|电脑|日用品|水果|蔬菜|菜|超市|淘宝|京东|拼多多|盒马|山姆/, '购物'],
    [/药|医院|挂号|体检|看病|医保/, '医疗'],
    [/电影|游戏|会员|订阅|演出|门票|KTV|旅游|酒店/, '娱乐'],
    [/书|课程|学费|培训|考试|文具/, '学习'],
    [/红包|礼物|请客|随礼|人情/, '人情'],
  ];
  for (const [re, cat] of rules) if (re.test(text)) return cat;
  return '未分类';
}

export const tools: ToolDef[] = [...readTools(), ...writeTools()];

export const toolByName = new Map(tools.map((t) => [t.name, t]));

/** 给 AI 的一句话能力清单（放 MCP server instructions） */
export function toolCatalog(): string {
  return tools.map((t) => `- ${t.name} (${t.scope}) ${t.description}`).join('\n');
}

export async function categoryHints(ctx: ToolCtx) {
  return {
    expense: await frequentCategories(uid(ctx), 'expense'),
    income: await frequentCategories(uid(ctx), 'income'),
  };
}

export async function habitHint(ctx: ToolCtx, ref: string) {
  const h = await findHabit(uid(ctx), ref);
  return h ?? one('select null');
}
