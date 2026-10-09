import { env } from './env';

/**
 * 日期工具：所有 day 都按「用户所在时区」的本地日期计算。
 * 服务器可能是 UTC，所以绝不能用 new Date().toISOString().slice(0,10)。
 */

export function todayIn(tz: string = env.defaultTimezone): string {
  return dayIn(new Date(), tz);
}

export function dayIn(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/** 校验并归一 yyyy-mm-dd；支持 今天/昨天/明天/周一/下周周三；都不合法则回退今天 */
export function normDay(input: unknown, tz: string = env.defaultTimezone): string {
  const s = typeof input === 'string' ? input.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return s;
  }
  if (s) {
    const loose = parseLooseDay(s, tz);
    if (loose) return loose;
    // 「2026/10/12」「2026.10.12」也认
    const m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    // 「10-12」按今年算
    const md = s.match(/^(\d{1,2})-([0-3]?\d)$/);
    if (md) return `${todayIn(tz).slice(0, 4)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }
  return todayIn(tz);
}

/** 相对天数偏移，返回 yyyy-mm-dd */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function eachDay(from: string, to: string, cap = 400): string[] {
  const out: string[] = [];
  const n = Math.min(Math.max(daysBetween(from, to), 0), cap);
  for (let i = 0; i <= n; i++) out.push(shiftDay(from, i));
  return out;
}

/**
 * 处理时间范围入参：
 *  - 传 from/to：直接用
 *  - 传 days=N：最近 N 天（含今天）
 *  - 传 range=week|month|today|yesterday
 * 默认今天。
 */
export function resolveRange(
  params: { from?: unknown; to?: unknown; days?: unknown; range?: unknown },
  tz: string = env.defaultTimezone,
): { from: string; to: string } {
  const today = todayIn(tz);
  const to = params.to ? normDay(params.to, tz) : today;
  if (params.from) return { from: normDay(params.from, tz), to };

  const range = String(params.range ?? '');
  if (range === 'today') return { from: today, to: today };
  if (range === 'yesterday') return { from: shiftDay(today, -1), to: shiftDay(today, -1) };
  if (range === 'week') return { from: shiftDay(today, -6), to: today };
  if (range === 'month') return { from: shiftDay(today, -29), to: today };
  if (range === 'year') return { from: shiftDay(today, -364), to: today };

  const days = Number(params.days);
  if (Number.isFinite(days) && days > 0) return { from: shiftDay(to, -(Math.min(days, 3660) - 1)), to };

  return { from: to, to };
}

/** 把「今天/昨天/明天/周三」这类自然语言解析成日期，解析不了返回 null */
export function parseLooseDay(text: string, tz: string = env.defaultTimezone): string | null {
  const t = text.trim();
  if (!t) return null;
  const today = todayIn(tz);
  if (t === '今天' || t === 'today') return today;
  if (t === '昨天' || t === 'yesterday') return shiftDay(today, -1);
  if (t === '前天') return shiftDay(today, -2);
  if (t === '明天' || t === 'tomorrow') return shiftDay(today, 1);
  if (t === '后天') return shiftDay(today, 2);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    // 格式对不代表日期有效："2026-13-45" 也会命中正则，必须再验一次
    const d = new Date(`${t}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : t;
  }
  const rel = t.match(/^([+-]?\d+)\s*(天|日|d)$/i);
  if (rel) return shiftDay(today, Number(rel[1]));
  const week = t.match(/^(?:下)?周(一|二|三|四|五|六|日|天)$/);
  if (week) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const target = map[week[1]];
    const cur = new Date(`${today}T12:00:00Z`).getUTCDay();
    const nextWeek = t.startsWith('下周');
    let delta = (target - cur + 7) % 7;
    if (delta === 0 && !nextWeek) delta = 0;
    else if (nextWeek) delta = delta === 0 ? 7 : delta + 7;
    return shiftDay(today, delta);
  }
  return null;
}

/** 按用户时区把「某天的某时刻」转成 timestamptz 用的 ISO 串 */
export function atTimeOfDay(day: string, hhmm = '12:00', tz: string = env.defaultTimezone): string {
  // 先按 UTC 造一个候选，再用该时区的偏移修正
  const naive = new Date(`${day}T${hhmm}:00Z`);
  const offset = tzOffsetMinutes(naive, tz);
  return new Date(naive.getTime() - offset * 60000).toISOString();
}

function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - date.getTime()) / 60000;
}

export function humanDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()];
  return `${day.slice(5)} ${w}`;
}
