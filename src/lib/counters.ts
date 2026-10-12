import { one, q } from './db';
import { daysBetween, normDay, shiftDay, todayIn } from './dates';

/**
 * 纪念日 / 累计天数。
 *
 * 口径说明（中文里两种说法都常见，这里统一成一个）：
 *   - 起始日当天算「第 1 天」 → ordinal = 已经过的天数 + 1
 *   - 例如 2020-05-20 结婚，2020-05-20 当天就是「第 1 天」
 * 界面主要展示 ordinal（「第 2335 天」），同时给出 elapsed（已经过 2334 天）供别处用。
 */

export type CounterMode = 'since' | 'until';
export type CounterRepeat = 'none' | 'yearly';

export interface Counter {
  id: number;
  user_id: string;
  name: string;
  icon: string | null;
  start_day: string;
  mode: string;
  repeat: string;
  color: string | null;
  note: string | null;
  sort: number;
  active: boolean;
  created_at: string;
}

export interface CounterView extends Counter {
  /** 已经过（since）/ 还剩（until）的天数 */
  days: number;
  /** 第几天（起始日当天 = 第 1 天）；until 模式下等于剩余天数 */
  ordinal: number;
  /** 展示用的主数字 */
  label: string;
  /** 今天是这一天本身吗 */
  isToday: boolean;
  /** repeat=yearly 时：第几周年（已经满几年） */
  years: number | null;
  /** repeat=yearly 时：下一个周年日期 */
  nextDay: string | null;
  /** repeat=yearly 时：距离下一个周年还有几天（今天就是则为 0） */
  daysToNext: number | null;
}

const COLS = `id, user_id, name, icon, start_day, mode, repeat, color, note, sort, active, created_at`;

/* ---------------------------------------------------------------- 天数运算 */

/** 某个日期在指定年份的「同月同日」；2-29 在平年顺延到 2-28，避免 Date 自动跳到 3-1 */
export function sameDayInYear(day: string, year: number): string {
  const [, m, d] = day.split('-');
  if (m === '02' && d === '29') {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? `${year}-02-29` : `${year}-02-28`;
  }
  return `${year}-${m}-${d}`;
}

export interface YearlyInfo {
  /** 到今天为止已经满了几周年（今天正好是纪念日就包含这一次） */
  completed: number;
  /** 下一个周年是第几周年 */
  nextOrdinal: number;
  /** 下一个周年日期 */
  nextDay: string;
  /** 距离下一个周年还有几天（今天就是则为 0） */
  daysToNext: number;
  /** 今天就是周年这一天 */
  isAnniversaryToday: boolean;
}

/**
 * 每年循环的纪念日：算出已经满几周年、下一个周年是哪天。
 *
 * 三种情况都要对（很容易写错）：
 *   起始 2020-05-20，今天 2026-10-10 → 今年这次已过：满了 6 周年，下一个 2027-05-20（第 7 个）
 *   起始 2020-05-20，今天 2026-05-20 → 今天就是：满了 6 周年，下一次 2027-05-20（第 7 个）
 *   起始 2020-05-20，今天 2026-01-15 → 今年这次还没到：满了 5 周年，下一个 2026-05-20（第 6 个）
 */
export function yearlyInfo(startDay: string, today: string): YearlyInfo {
  const startYear = Number(startDay.slice(0, 4));
  const todayYear = Number(today.slice(0, 4));
  const thisYear = sameDayInYear(startDay, todayYear);
  const diff = daysBetween(today, thisYear); // >0 还没到；=0 就是今天；<0 已经过了

  const isAnniversaryToday = diff === 0;

  if (diff >= 0) {
    // 今年的这次还没到（或就是今天）
    return {
      completed: todayYear - startYear - (isAnniversaryToday ? 0 : 1),
      nextOrdinal: todayYear - startYear,
      nextDay: thisYear,
      daysToNext: diff,
      isAnniversaryToday,
    };
  }

  // 今年的已经过了
  const nextYearDay = sameDayInYear(startDay, todayYear + 1);
  return {
    completed: todayYear - startYear,
    nextOrdinal: todayYear - startYear + 1,
    nextDay: nextYearDay,
    daysToNext: daysBetween(today, nextYearDay),
    isAnniversaryToday: false,
  };
}

/** 把一个纪念日算成可展示的视图 */
export function computeCounter(c: Counter, today: string): CounterView {
  const elapsed = daysBetween(c.start_day, today);
  const isStartDay = c.start_day === today;
  const yearly = c.repeat === 'yearly' ? yearlyInfo(c.start_day, today) : null;

  if (c.mode === 'until') {
    // 倒计时：repeat=yearly 看下一个周年；否则就是那个固定日期
    const target = yearly ? yearly.nextDay : c.start_day;
    const days = daysBetween(today, target);
    const hit = days === 0;
    return {
      ...c,
      days: Math.max(days, 0),
      ordinal: yearly ? yearly.nextOrdinal : Math.max(days, 0),
      label: hit ? '就是今天' : `还有 ${days} 天`,
      isToday: hit,
      years: yearly ? yearly.nextOrdinal : null,
      nextDay: target,
      daysToNext: days,
    };
  }

  // 累计：起始日当天算「第 1 天」
  return {
    ...c,
    days: elapsed,
    ordinal: elapsed + 1,
    label: `第 ${elapsed + 1} 天`,
    isToday: isStartDay || Boolean(yearly?.isAnniversaryToday),
    years: yearly ? yearly.completed : null,
    nextDay: yearly?.nextDay ?? null,
    daysToNext: yearly?.daysToNext ?? null,
  };
}

/** 展示用的一句话摘要（界面与 AI 共用，避免两处文案不一致） */
export function counterSummary(v: CounterView): string {
  if (v.mode === 'until') {
    if (v.daysToNext === 0) return `今天就是${v.name}`;
    return `距离${v.name}还有 ${v.daysToNext} 天`;
  }
  if (v.years && v.daysToNext === 0) return `今天是${v.name}，第 ${v.years} 周年`;
  if (v.years) return `${v.name}第 ${v.ordinal} 天（${v.years} 周年，距下一个还有 ${v.daysToNext} 天）`;
  return `${v.name}第 ${v.ordinal} 天`;
}

/* ---------------------------------------------------------------- 读写 */

export async function listCounters(userId: string, includeInactive = false): Promise<Counter[]> {
  return q<Counter>(
    `select ${COLS} from counters where user_id = $1 ${includeInactive ? '' : 'and active = true'}
      order by sort asc, id asc`,
    [userId],
  );
}

export async function listCounterViews(userId: string, tz: string, day?: string): Promise<CounterView[]> {
  const today = day ? normDay(day, tz) : todayIn(tz);
  const rows = await listCounters(userId);
  return rows.map((c) => computeCounter(c, today));
}

export interface CounterInput {
  name: string;
  start_day: string;
  icon?: string | null;
  mode?: CounterMode;
  repeat?: CounterRepeat;
  color?: string | null;
  note?: string | null;
  sort?: number;
  active?: boolean;
}

export interface UpsertResult {
  counter: Counter;
  /** 是新建还是覆盖了同名的旧记录（同名覆盖必须让调用方能说清楚，否则用户以为在新增） */
  created: boolean;
}

export async function upsertCounter(userId: string, tz: string, input: CounterInput): Promise<UpsertResult> {
  const existing = await one<{ id: number }>(
    'select id from counters where user_id = $1 and name = $2',
    [userId, input.name.trim()],
  );
  const row = await one<Counter>(
    `insert into counters (user_id, name, icon, start_day, mode, repeat, color, note, sort, active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10, true))
     on conflict (user_id, name) do update set
       icon = excluded.icon,
       start_day = excluded.start_day,
       mode = excluded.mode,
       repeat = excluded.repeat,
       color = excluded.color,
       note = excluded.note,
       sort = excluded.sort,
       active = excluded.active
     returning ${COLS}`,
    [
      userId,
      input.name.trim(),
      input.icon ?? null,
      normDay(input.start_day, tz),
      input.mode === 'until' ? 'until' : 'since',
      input.repeat === 'yearly' ? 'yearly' : 'none',
      input.color ?? null,
      input.note ?? null,
      Number(input.sort) || 0,
      input.active,
    ],
  );
  return { counter: row!, created: !existing };
}

export async function findCounter(userId: string, ref: string | number): Promise<Counter | null> {
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const c = await one<Counter>(`select ${COLS} from counters where id = $1 and user_id = $2`, [Number(ref), userId]);
    if (c) return c;
  }
  return one<Counter>(
    `select ${COLS} from counters where user_id = $1 and name ilike $2 order by active desc, id asc limit 1`,
    [userId, `%${String(ref)}%`],
  );
}

export async function updateCounter(
  userId: string,
  tz: string,
  ref: string | number,
  patch: Partial<CounterInput>,
): Promise<Counter | null> {
  const c = await findCounter(userId, ref);
  if (!c) return null;
  const sets: string[] = [];
  const args: unknown[] = [c.id, userId];
  const push = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.name !== undefined) push('name', patch.name.trim());
  if (patch.icon !== undefined) push('icon', patch.icon);
  if (patch.start_day !== undefined) push('start_day', normDay(patch.start_day, tz));
  if (patch.mode !== undefined) push('mode', patch.mode === 'until' ? 'until' : 'since');
  if (patch.repeat !== undefined) push('repeat', patch.repeat === 'yearly' ? 'yearly' : 'none');
  if (patch.color !== undefined) push('color', patch.color);
  if (patch.note !== undefined) push('note', patch.note);
  if (patch.sort !== undefined) push('sort', Number(patch.sort) || 0);
  if (patch.active !== undefined) push('active', patch.active);
  if (!sets.length) return c;
  return one<Counter>(`update counters set ${sets.join(', ')} where id = $1 and user_id = $2 returning ${COLS}`, args);
}

export async function deleteCounter(userId: string, ref: string | number): Promise<boolean> {
  const c = await findCounter(userId, ref);
  if (!c) return false;
  await q('delete from counters where id = $1 and user_id = $2', [c.id, userId]);
  return true;
}

/** 今天正好是纪念日的那些（用于首页高亮 / 提醒） */
export function anniversariesToday(views: CounterView[]): CounterView[] {
  return views.filter((v) => v.daysToNext === 0 || v.isToday);
}

/** 按「下一个要到的日子」排序，用于「即将到来」列表 */
export function upcoming(views: CounterView[], withinDays = 30): CounterView[] {
  return views
    .filter((v) => v.daysToNext !== null && v.daysToNext > 0 && v.daysToNext <= withinDays)
    .sort((a, b) => (a.daysToNext ?? 0) - (b.daysToNext ?? 0));
}

/** 给「今天」页的排序：今天到的排最前，然后按还剩天数升序，最后按累计天数降序 */
export function sortForDisplay(views: CounterView[]): CounterView[] {
  return [...views].sort((a, b) => {
    const at = a.daysToNext === 0 || a.isToday ? 1 : 0;
    const bt = b.daysToNext === 0 || b.isToday ? 1 : 0;
    if (at !== bt) return bt - at;
    if (a.daysToNext !== null && b.daysToNext !== null) return a.daysToNext - b.daysToNext;
    return b.ordinal - a.ordinal;
  });
}

export { shiftDay };
