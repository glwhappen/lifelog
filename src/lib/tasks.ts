import { one, q, tx } from './db';
import { normDay, resolveRange, todayIn, shiftDay } from './dates';
import type { Task } from './types';

const COLS = `id, user_id, title, note, status, priority, planned_day, due_day, done_at,
  tags, parent_id, sort, source, created_at, updated_at, deleted_at`;

export interface TaskInput {
  title: string;
  note?: string;
  planned_day?: string | null;
  due_day?: string | null;
  priority?: number;
  tags?: string[];
  source?: string;
}

/**
 * 新建任务。planned_day 语义：
 *   - 传日期（含「明天/周一」这类口语）→ 计划那天
 *   - 传 null 或空串 → 收集箱
 *   - 字段缺失（undefined）→ 默认今天（「记录每日 todo」是本项目的主场景）
 */
export async function createTask(userId: string, tz: string, input: TaskInput): Promise<Task> {
  const planned =
    input.planned_day === null || input.planned_day === ''
      ? null
      : input.planned_day
        ? normDay(input.planned_day, tz)
        : todayIn(tz);
  const row = await one<Task>(
    `insert into tasks (user_id, title, note, planned_day, due_day, priority, tags, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning ${COLS}`,
    [
      userId,
      input.title.trim(),
      input.note ?? null,
      planned,
      input.due_day === null ? null : input.due_day ? normDay(input.due_day, tz) : null,
      Number(input.priority) || 0,
      input.tags ?? [],
      input.source ?? 'web',
    ],
  );
  return row!;
}

export interface TaskQuery {
  state?: 'pending' | 'done' | 'cancelled' | 'all' | 'overdue' | 'today';
  from?: unknown;
  to?: unknown;
  days?: unknown;
  range?: unknown;
  q?: string;
  tags?: string[];
  limit?: number;
}

export async function listTasks(userId: string, tz: string, query: TaskQuery = {}): Promise<Task[]> {
  const today = todayIn(tz);
  const where: string[] = ['user_id = $1', 'deleted_at is null'];
  const args: unknown[] = [userId];
  const state = query.state ?? 'all';

  if (state === 'pending') {
    // 「未完成」= 所有还没做的，包含计划在未来的。
    // 以前这里加了 planned_day <= today，导致「明天要做」的任务在
    // 今天/未完成/逾期/已完成 任何一个标签下都看不见（只有全部能看到）。
    where.push(`status = 'pending'`);
  } else if (state === 'today') {
    where.push(`status = 'pending'`);
    args.push(today);
    where.push(`planned_day = $${args.length}`);
  } else if (state === 'overdue') {
    where.push(`status = 'pending' and planned_day < $2`);
    args.push(today);
  } else if (state !== 'all') {
    args.push(state);
    where.push(`status = $${args.length}`);
  }

  // done 榜按完成时间过滤，其余按计划日过滤
  if (state === 'done') {
    const { from, to } = resolveRange(query, tz);
    args.push(from, to, tz);
    where.push(
      `done_at >= ($${args.length - 2}::timestamp at time zone $${args.length})
       and done_at < (($${args.length - 1}::date + 1)::timestamp at time zone $${args.length})`,
    );
  } else if (query.from !== undefined || query.days !== undefined || query.range !== undefined) {
    const { from, to } = resolveRange(query, tz);
    args.push(from, to);
    where.push(`planned_day between $${args.length - 1} and $${args.length}`);
  }

  if (query.tags?.length) {
    args.push(query.tags);
    where.push(`tags && $${args.length}`);
  }
  if (query.q) {
    args.push(`%${query.q}%`);
    where.push(`(title ilike $${args.length} or coalesce(note,'') ilike $${args.length})`);
  }

  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000);
  args.push(limit);
  const order =
    state === 'done' ? 'done_at desc' : state === 'all' ? 'created_at desc' : 'priority desc, sort asc, id asc';
  return q<Task>(
    `select ${COLS} from tasks where ${where.join(' and ')} order by ${order} limit $${args.length}`,
    args,
  );
}

/** 今天的完成榜：done_at 落在今天（按用户时区） */
export async function doneOn(userId: string, tz: string, day: string): Promise<Task[]> {
  return q<Task>(
    `select ${COLS} from tasks
      where user_id = $1 and deleted_at is null and status = 'done'
        and done_at is not null
        and to_char(done_at at time zone $3, 'YYYY-MM-DD') = $2
      order by done_at asc`,
    [userId, day, tz],
  );
}

export async function getTask(userId: string, id: number): Promise<Task | null> {
  return one<Task>(`select ${COLS} from tasks where id = $1 and user_id = $2 and deleted_at is null`, [id, userId]);
}

/** 按 id 或标题模糊匹配找任务（AI 常用「把 买牛奶 标记完成」这种说法） */
export async function findTask(userId: string, ref: string | number): Promise<Task | null> {
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const t = await getTask(userId, Number(ref));
    if (t) return t;
  }
  return one<Task>(
    `select ${COLS} from tasks
      where user_id = $1 and deleted_at is null and status = 'pending' and title ilike $2
      order by id desc limit 1`,
    [userId, `%${String(ref)}%`],
  );
}

/** 完成任务：同时往 entries 写一条 kind='done' 的镜像，保证「流水」里有完整的一天。 */
export async function completeTask(
  userId: string,
  tz: string,
  ref: string | number,
  opts: { day?: string; note?: string; source?: string } = {},
): Promise<{ task: Task; entryId: number } | null> {
  const task = await findTask(userId, ref);
  if (!task) return null;
  const day = opts.day ? normDay(opts.day, tz) : todayIn(tz);
  const isToday = day === todayIn(tz);
  // 补记往日时用中午 12 点，当天则用当下时刻
  const doneExpr = isToday
    ? 'now()'
    : `('${day}T12:00:00'::timestamp at time zone '${tz.replace(/'/g, "''")}')`;

  return tx(async (c) => {
    const updated = await c.one<Task>(
      `update tasks set status = 'done', done_at = ${doneExpr}, updated_at = now()
        where id = $1 and user_id = $2 returning ${COLS}`,
      [task.id, userId],
    );
    const entry = await c.one<{ id: number }>(
      `insert into entries (user_id, kind, day, happened_at, title, content, tags, source, task_id, meta)
       values ($1, 'done', $2, ${doneExpr}, $3, $4, $5, $6, $7, '{}'::jsonb)
       returning id`,
      [userId, day, task.title, opts.note ?? task.note, task.tags, opts.source ?? 'web', task.id],
    );
    return { task: updated!, entryId: entry!.id };
  });
}

export async function updateTask(
  userId: string,
  tz: string,
  ref: string | number,
  patch: Partial<TaskInput> & { status?: string },
): Promise<Task | null> {
  const task = await findTask(userId, ref);
  if (!task) return null;
  const sets: string[] = [];
  const args: unknown[] = [task.id, userId];
  const push = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.note !== undefined) push('note', patch.note);
  if (patch.priority !== undefined) push('priority', patch.priority);
  if (patch.tags !== undefined) push('tags', patch.tags);
  if (patch.planned_day !== undefined) push('planned_day', patch.planned_day ? normDay(patch.planned_day, tz) : null);
  if (patch.due_day !== undefined) push('due_day', patch.due_day ? normDay(patch.due_day, tz) : null);
  if (patch.status !== undefined) {
    push('status', patch.status);
    if (patch.status !== 'done') push('done_at', null);
  }
  if (!sets.length) return task;
  sets.push('updated_at = now()');
  return one<Task>(`update tasks set ${sets.join(', ')} where id = $1 and user_id = $2 returning ${COLS}`, args);
}

/** 顺延到明天（未完成任务的常用操作） */
export async function postponeTask(userId: string, tz: string, ref: string | number, toDay?: string): Promise<Task | null> {
  const task = await findTask(userId, ref);
  if (!task) return null;
  const base = toDay ? normDay(toDay, tz) : shiftDay(todayIn(tz), 1);
  return updateTask(userId, tz, task.id, { planned_day: base });
}

export async function deleteTask(userId: string, ref: string | number): Promise<boolean> {
  const task = await findTask(userId, ref);
  if (!task) return false;
  await q(
    `update tasks set deleted_at = now() where id = $1 and user_id = $2`,
    [task.id, userId],
  );
  await q(`update entries set deleted_at = now() where task_id = $1 and user_id = $2 and deleted_at is null`, [
    task.id,
    userId,
  ]);
  return true;
}

/** 待办统计：今天计划 / 已完成 / 逾期 / 收集箱 */
export async function taskCounts(userId: string, tz: string, day?: string) {
  const today = day ? normDay(day, tz) : todayIn(tz);
  return (
    (await one<{ planned: number; done: number; overdue: number; inbox: number }>(
      `select
         count(*) filter (where status = 'pending' and planned_day = $2::text::date)::int as planned,
         count(*) filter (where status = 'done' and done_at is not null
                and to_char(done_at at time zone $3, 'YYYY-MM-DD') = $2)::int as done,
         count(*) filter (where status = 'pending' and planned_day < $2::text::date)::int as overdue,
         count(*) filter (where status = 'pending' and planned_day is null)::int as inbox
       from tasks where user_id = $1 and deleted_at is null`,
      [userId, today, tz],
    )) ?? { planned: 0, done: 0, overdue: 0, inbox: 0 }
  );
}
