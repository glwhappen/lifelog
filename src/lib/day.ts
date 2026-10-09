import { one, q } from './db';
import { normDay, todayIn, shiftDay } from './dates';
import { doneOn, taskCounts } from './tasks';
import { listHabits } from './habits';
import type { Entry, Task } from './types';

export interface DayView {
  day: string;
  isToday: boolean;
  tasks: {
    planned: Task[];
    done: Task[];
    overdue: Task[];
    inbox: Task[];
    counts: { planned: number; done: number; overdue: number; inbox: number };
  };
  entries: Record<string, Entry[]>;
  entryCount: number;
  habits: Array<{ id: number; name: string; icon: string | null; kind: string; target: number | null; unit: string | null; value: number; done: boolean }>;
  finance: { expense: number; income: number; items: Entry[] };
  locations: Array<{ id: number; happened_at: string; place_name: string | null; city: string | null; lat: number; lng: number }>;
  summary: { mood: number | null; energy: number | null; summary: string | null; ai_summary: string | null } | null;
}

/** 「今天全貌」：AI 和首页共用的核心聚合。 */
export async function getDay(userId: string, tz: string, dayInput?: string): Promise<DayView> {
  const today = todayIn(tz);
  const day = normDay(dayInput ?? today, tz);

  const [planned, done, overdue, inbox, counts] = await Promise.all([
    q<Task>(
      `select * from tasks where user_id = $1 and deleted_at is null and status = 'pending' and planned_day = $2
        order by priority desc, sort asc, id asc`,
      [userId, day],
    ),
    doneOn(userId, tz, day),
    q<Task>(
      `select * from tasks where user_id = $1 and deleted_at is null and status = 'pending' and planned_day < $2
        order by planned_day asc limit 50`,
      [userId, day],
    ),
    q<Task>(
      `select * from tasks where user_id = $1 and deleted_at is null and status = 'pending' and planned_day is null
        order by priority desc, id desc limit 50`,
      [userId],
    ),
    taskCounts(userId, tz, day),
  ]);

  const entries = await q<Entry>(
    `select id, user_id, kind, day, happened_at, title, content, amount, currency, category, tags, source, meta, task_id, created_at, updated_at, deleted_at
       from entries where user_id = $1 and deleted_at is null and day = $2
      order by happened_at asc, id asc`,
    [userId, day],
  );

  const grouped: Record<string, Entry[]> = {};
  for (const e of entries) {
    // 任务完成镜像到 done 流水里，但「完成榜」已经单列，这里只保留手工记录的 done
    if (e.kind === 'done' && e.task_id) continue;
    (grouped[e.kind] ??= []).push(e);
  }

  const habitRows = await listHabits(userId);
  const logs = await q<{ habit_id: number; value: number }>(
    `select habit_id, value from habit_logs where user_id = $1 and day = $2`,
    [userId, day],
  );
  const logMap = new Map(logs.map((l) => [l.habit_id, Number(l.value)]));
  const habits = habitRows.map((h) => {
    const value = logMap.get(h.id) ?? 0;
    const done = h.kind === 'count' ? value >= (h.target ?? 1) : value >= 1;
    return { id: h.id, name: h.name, icon: h.icon, kind: h.kind, target: h.target, unit: h.unit, value, done };
  });

  const financeRows = entries.filter((e) => e.kind === 'expense' || e.kind === 'income');
  const finance = {
    expense: financeRows.filter((e) => e.kind === 'expense').reduce((s, e) => s + Number(e.amount ?? 0), 0),
    income: financeRows.filter((e) => e.kind === 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0),
    items: financeRows,
  };

  const locs = await q<{ id: number; happened_at: string; place_name: string | null; city: string | null; lat: number; lng: number }>(
    `select id, happened_at, place_name, city, lat, lng from locations
      where user_id = $1 and day = $2 order by happened_at asc limit 200`,
    [userId, day],
  );

  const summary = await one<{ mood: number | null; energy: number | null; summary: string | null; ai_summary: string | null }>(
    `select mood, energy, summary, ai_summary from daily_summaries where user_id = $1 and day = $2`,
    [userId, day],
  );

  return {
    day,
    isToday: day === today,
    tasks: { planned, done, overdue, inbox, counts },
    entries: grouped,
    entryCount: entries.length,
    habits,
    finance,
    locations: locs,
    summary: summary ?? null,
  };
}

export async function saveSummary(
  userId: string,
  tz: string,
  input: { day?: string; summary?: string; mood?: number | null; energy?: number | null; aiSummary?: string | null },
) {
  const day = normDay(input.day ?? todayIn(tz), tz);
  return one(
    `insert into daily_summaries (user_id, day, summary, mood, energy, ai_summary, ai_generated_at)
     values ($1,$2,$3,$4,$5,$6, case when $6::text is null then null else now() end)
     on conflict (user_id, day) do update set
       summary = coalesce(excluded.summary, daily_summaries.summary),
       mood = coalesce(excluded.mood, daily_summaries.mood),
       energy = coalesce(excluded.energy, daily_summaries.energy),
       ai_summary = coalesce(excluded.ai_summary, daily_summaries.ai_summary),
       ai_generated_at = case when excluded.ai_summary is null then daily_summaries.ai_generated_at else now() end,
       updated_at = now()
     returning *`,
    [userId, day, input.summary ?? null, input.mood ?? null, input.energy ?? null, input.aiSummary ?? null],
  );
}

/** 连续记录天数（任何流水都算） */
export async function loggingStreak(userId: string, tz: string): Promise<number> {
  const rows = await q<{ day: string }>(
    `select distinct to_char(day, 'YYYY-MM-DD') as day from entries
      where user_id = $1 and deleted_at is null order by day desc limit 400`,
    [userId],
  );
  const days = new Set(rows.map((r) => r.day));
  let streak = 0;
  let cursor = todayIn(tz);
  if (!days.has(cursor)) cursor = shiftDay(cursor, -1); // 今天还没记，从昨天算
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
