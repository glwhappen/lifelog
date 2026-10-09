import { one, q } from './db';
import { eachDay, normDay, resolveRange, todayIn } from './dates';
import type { Habit, HabitLog } from './types';

const HABIT_COLS = `id, user_id, name, icon, color, kind, target, unit, freq, sort, active, created_at`;

export const DEFAULT_HABITS: Array<Pick<Habit, 'name' | 'icon' | 'kind' | 'target' | 'unit' | 'sort'>> = [
  { name: '早起', icon: '🌅', kind: 'bool', target: null, unit: null, sort: 10 },
  { name: '运动', icon: '🏃', kind: 'bool', target: null, unit: null, sort: 20 },
  { name: '阅读', icon: '📖', kind: 'bool', target: null, unit: null, sort: 30 },
  { name: '喝水', icon: '💧', kind: 'count', target: 8, unit: '杯', sort: 40 },
  { name: '颈椎操', icon: '🧘', kind: 'bool', target: null, unit: null, sort: 50 },
  { name: '不熬夜', icon: '🌙', kind: 'bool', target: null, unit: null, sort: 60 },
  { name: '记账', icon: '💰', kind: 'bool', target: null, unit: null, sort: 70 },
  { name: '每日复盘', icon: '📝', kind: 'bool', target: null, unit: null, sort: 80 },
];

export async function listHabits(userId: string, includeInactive = false): Promise<Habit[]> {
  return q<Habit>(
    `select ${HABIT_COLS} from habits where user_id = $1 ${includeInactive ? '' : 'and active = true'}
      order by sort asc, id asc`,
    [userId],
  );
}

export async function ensureDefaultHabits(userId: string): Promise<Habit[]> {
  const existing = await listHabits(userId, true);
  if (existing.length) return existing;
  for (const h of DEFAULT_HABITS) {
    await q(
      `insert into habits (user_id, name, icon, kind, target, unit, sort) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (user_id, name) do nothing`,
      [userId, h.name, h.icon, h.kind, h.target, h.unit, h.sort],
    );
  }
  return listHabits(userId, true);
}

export interface HabitInput {
  name: string;
  icon?: string;
  color?: string;
  kind?: 'bool' | 'count';
  target?: number | null;
  unit?: string | null;
  freq?: string;
  sort?: number;
  active?: boolean;
}

export async function upsertHabit(userId: string, input: HabitInput): Promise<Habit> {
  const row = await one<Habit>(
    `insert into habits (user_id, name, icon, color, kind, target, unit, freq, sort, active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10, true))
     on conflict (user_id, name) do update set
       icon = coalesce(excluded.icon, habits.icon),
       color = coalesce(excluded.color, habits.color),
       kind = excluded.kind,
       target = excluded.target,
       unit = excluded.unit,
       freq = excluded.freq,
       sort = excluded.sort,
       active = excluded.active
     returning ${HABIT_COLS}`,
    [
      userId,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.kind ?? 'bool',
      input.target ?? null,
      input.unit ?? null,
      input.freq ?? 'daily',
      Number(input.sort) || 0,
      input.active,
    ],
  );
  return row!;
}

export async function deleteHabit(userId: string, ref: string | number): Promise<boolean> {
  const habit = await findHabit(userId, ref);
  if (!habit) return false;
  await q('delete from habits where id = $1 and user_id = $2', [habit.id, userId]);
  return true;
}

export async function findHabit(userId: string, ref: string | number): Promise<Habit | null> {
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const h = await one<Habit>(`select ${HABIT_COLS} from habits where id = $1 and user_id = $2`, [Number(ref), userId]);
    if (h) return h;
  }
  return one<Habit>(
    `select ${HABIT_COLS} from habits where user_id = $1 and name ilike $2 order by active desc, id asc limit 1`,
    [userId, `%${String(ref)}%`],
  );
}

/**
 * 打卡：bool 型重复打卡不叠加（幂等）；count 型按增量累加。
 * 传 value 时：bool 视为打卡，count 视为「设为该值」；不传则 bool=1、count=+1。
 */
export async function checkHabit(
  userId: string,
  tz: string,
  ref: string | number,
  opts: { day?: string; value?: number; note?: string; set?: boolean } = {},
): Promise<HabitLog | null> {
  let habit = await findHabit(userId, ref);
  // 首次使用（还没有任何习惯）时自动建默认习惯，打卡直接可用
  if (!habit) {
    await ensureDefaultHabits(userId);
    habit = await findHabit(userId, ref);
  }
  if (!habit) return null;
  const day = opts.day ? normDay(opts.day, tz) : todayIn(tz);
  const delta = opts.value ?? (habit.kind === 'count' ? 1 : 1);
  const mode = opts.set || habit.kind === 'bool' ? 'set' : 'add';

  const row = await one<HabitLog>(
    mode === 'set'
      ? `insert into habit_logs (habit_id, user_id, day, value, note) values ($1,$2,$3,$4,$5)
         on conflict (habit_id, day) do update set value = $4, note = coalesce($5, habit_logs.note)
         returning id, habit_id, user_id, day, value, note, created_at`
      : `insert into habit_logs (habit_id, user_id, day, value, note) values ($1,$2,$3,$4,$5)
         on conflict (habit_id, day) do update set value = habit_logs.value + $4, note = coalesce($5, habit_logs.note)
         returning id, habit_id, user_id, day, value, note, created_at`,
    [habit.id, userId, day, delta, opts.note ?? null],
  );
  return row;
}

export async function uncheckHabit(userId: string, ref: string | number, day?: string, tz?: string): Promise<boolean> {
  const habit = await findHabit(userId, ref);
  if (!habit) return false;
  const d = day ? normDay(day, tz) : todayIn(tz);
  const rows = await q('delete from habit_logs where habit_id = $1 and user_id = $2 and day = $3 returning id', [
    habit.id,
    userId,
    d,
  ]);
  return rows.length > 0;
}

export interface HabitDayCell {
  day: string;
  value: number;
}

export interface HabitStat {
  habit: Habit;
  cells: HabitDayCell[];
  doneDays: number;
  totalDays: number;
  currentStreak: number;
  longestStreak: number;
  rate: number;
}

/** 习惯统计：逐日取值 + 连续天数（bool 型：value >= 1 记为完成；count 型：达到 target 记为完成） */
export async function habitStats(
  userId: string,
  tz: string,
  range: { from?: unknown; to?: unknown; days?: unknown; range?: unknown },
): Promise<HabitStat[]> {
  const { from, to } = resolveRange(range, tz);
  const habits = await listHabits(userId);
  // 连续天数要看更长的历史，单独放宽查询区间（近一年）
  const historyFrom = shiftDays(from, -365);
  const logs = await q<{ habit_id: number; day: string; value: number }>(
    `select habit_id, to_char(day, 'YYYY-MM-DD') as day, value from habit_logs
      where user_id = $1 and day between $2 and $3 order by day asc`,
    [userId, historyFrom, to],
  );
  const byHabit = new Map<number, Map<string, number>>();
  for (const l of logs) {
    if (!byHabit.has(l.habit_id)) byHabit.set(l.habit_id, new Map());
    byHabit.get(l.habit_id)!.set(l.day, Number(l.value));
  }

  const days = eachDay(from, to);
  const historyDays = eachDay(historyFrom, to, 800);
  const isDone = (h: Habit, v: number | undefined) => {
    if (v === undefined) return false;
    if (h.kind === 'count') return v >= (h.target ?? 1);
    return v >= 1;
  };

  return habits.map((h) => {
    const map = byHabit.get(h.id) ?? new Map();
    const cells = days.map((d) => ({ day: d, value: map.get(d) ?? 0 }));
    const doneDays = cells.filter((c) => isDone(h, c.value || undefined)).length;

    let longestStreak = 0;
    let run = 0;
    for (const d of historyDays) {
      if (isDone(h, map.get(d))) {
        run += 1;
        longestStreak = Math.max(longestStreak, run);
      } else {
        run = 0;
      }
    }
    return {
      habit: h,
      cells,
      doneDays,
      totalDays: days.length,
      currentStreak: run,
      longestStreak,
      rate: days.length ? doneDays / days.length : 0,
    };
  });
}

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
