import { describe, expect, it } from 'vitest';
import {
  atTimeOfDay,
  dayIn,
  daysBetween,
  eachDay,
  humanDay,
  normDay,
  parseLooseDay,
  resolveRange,
  shiftDay,
  todayIn,
} from '@/lib/dates';

const SH = 'Asia/Shanghai';
const NY = 'America/New_York';
const UTC = 'UTC';

/** 把 ISO 时刻按某时区格式化成 YYYY-MM-DD HH:mm，用来做往返校验 */
function fmtIn(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

describe('dayIn / todayIn —— 按用户时区算「今天」', () => {
  it('UTC 服务器上的同一时刻，上海已经是第二天', () => {
    // 这是本项目踩过的坑：服务器在 UTC，上海凌晨属于「新的一天」
    const t = new Date('2026-10-09T17:30:00Z');
    expect(dayIn(t, UTC)).toBe('2026-10-09');
    expect(dayIn(t, SH)).toBe('2026-10-10');
  });

  it('上海与纽约分处不同日期（时差 12~13 小时）', () => {
    const t = new Date('2026-07-04T02:00:00Z');
    expect(dayIn(t, SH)).toBe('2026-07-04'); // 上海 10:00
    expect(dayIn(t, NY)).toBe('2026-07-03'); // 纽约 22:00（前一天）
  });

  it('夏令时切换当天仍然正确', () => {
    // 美东 2026-03-08 02:00 跳到 03:00
    expect(dayIn(new Date('2026-03-08T06:59:00Z'), NY)).toBe('2026-03-08'); // 01:59 EST
    expect(dayIn(new Date('2026-03-08T07:01:00Z'), NY)).toBe('2026-03-08'); // 03:01 EDT
    // 秋季回拨当天（11-01 02:00 回到 01:00）
    expect(dayIn(new Date('2026-11-01T05:30:00Z'), NY)).toBe('2026-11-01');
  });

  it('todayIn 返回的是合法日期串，且随时区变化', () => {
    for (const tz of [SH, NY, UTC, 'Asia/Tokyo', 'Europe/London']) {
      expect(todayIn(tz)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // 纽约总是 <= 上海（不会超前，因为上海在东八区）
    expect(todayIn(NY) <= todayIn(SH)).toBe(true);
  });

  it('dayIn 绝不能用 toISOString 冒充（回归测试）', () => {
    const t = new Date('2026-10-09T17:30:00Z');
    expect(dayIn(t, SH)).not.toBe(t.toISOString().slice(0, 10));
  });
});

describe('normDay —— 宽松日期归一', () => {
  it('标准格式原样返回', () => {
    expect(normDay('2026-10-12', SH)).toBe('2026-10-12');
    expect(normDay(' 2026-01-05 ', SH)).toBe('2026-01-05');
  });

  it('接受斜杠/点号分隔', () => {
    expect(normDay('2026/7/4', SH)).toBe('2026-07-04');
    expect(normDay('2026.12.31', SH)).toBe('2026-12-31');
  });

  it('接受「月-日」按当年算', () => {
    const y = todayIn(SH).slice(0, 4);
    expect(normDay('10-12', SH)).toBe(`${y}-10-12`);
    expect(normDay('3-5', SH)).toBe(`${y}-03-05`);
  });

  it('接受口语日期', () => {
    expect(normDay('今天', SH)).toBe(todayIn(SH));
    expect(normDay('昨天', SH)).toBe(shiftDay(todayIn(SH), -1));
    expect(normDay('明天', SH)).toBe(shiftDay(todayIn(SH), 1));
  });

  it('非法输入回退到今天而不是抛错（工具入参不可信）', () => {
    expect(normDay('', SH)).toBe(todayIn(SH));
    expect(normDay('随便什么', SH)).toBe(todayIn(SH));
    expect(normDay(null, SH)).toBe(todayIn(SH));
    expect(normDay(undefined, SH)).toBe(todayIn(SH));
    expect(normDay(12345, SH)).toBe(todayIn(SH));
    expect(normDay('2026-13-45', SH)).toBe(todayIn(SH));
  });
});

describe('shiftDay / daysBetween / eachDay', () => {
  it('跨月、跨年、闰年都正确', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29'); // 闰年
    expect(shiftDay('2026-10-10', 0)).toBe('2026-10-10');
  });

  it('daysBetween 是符号化的天数差', () => {
    expect(daysBetween('2026-10-01', '2026-10-10')).toBe(9);
    expect(daysBetween('2026-10-10', '2026-10-01')).toBe(-9);
    expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0);
  });

  it('eachDay 含首尾，且响应 cap 限制', () => {
    expect(eachDay('2026-10-08', '2026-10-10')).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
    expect(eachDay('2026-10-10', '2026-10-10')).toEqual(['2026-10-10']);
    expect(eachDay('2026-10-10', '2026-10-01')).toEqual(['2026-10-10']); // 反向只有一天
    expect(eachDay('2026-01-01', '2026-12-31', 5)).toHaveLength(6); // cap=5 → 6 个点
  });
});

describe('resolveRange —— 区间入参解析', () => {
  const today = todayIn(SH);

  it('默认是今天', () => {
    expect(resolveRange({}, SH)).toEqual({ from: today, to: today });
  });

  it('from/to 显式指定', () => {
    expect(resolveRange({ from: '2026-10-01', to: '2026-10-05' }, SH)).toEqual({
      from: '2026-10-01',
      to: '2026-10-05',
    });
  });

  it('只给 to 时 from 默认等于 to', () => {
    expect(resolveRange({ to: '2026-10-05' }, SH)).toEqual({ from: '2026-10-05', to: '2026-10-05' });
  });

  it('days=N 表示最近 N 天且含今天', () => {
    expect(resolveRange({ days: 7 }, SH)).toEqual({ from: shiftDay(today, -6), to: today });
    expect(resolveRange({ days: 1 }, SH)).toEqual({ from: today, to: today });
  });

  it('range 快捷值', () => {
    expect(resolveRange({ range: 'today' }, SH)).toEqual({ from: today, to: today });
    expect(resolveRange({ range: 'yesterday' }, SH)).toEqual({
      from: shiftDay(today, -1),
      to: shiftDay(today, -1),
    });
    expect(resolveRange({ range: 'week' }, SH)).toEqual({ from: shiftDay(today, -6), to: today });
    expect(resolveRange({ range: 'month' }, SH)).toEqual({ from: shiftDay(today, -29), to: today });
    expect(resolveRange({ range: 'year' }, SH)).toEqual({ from: shiftDay(today, -364), to: today });
  });

  it('days 有上限，防止一次拉爆数据库', () => {
    const r = resolveRange({ days: 999999 }, SH);
    expect(daysBetween(r.from, r.to)).toBeLessThanOrEqual(3659);
  });

  it('days 为 0/负数/非数字时退回默认', () => {
    expect(resolveRange({ days: 0 }, SH)).toEqual({ from: today, to: today });
    expect(resolveRange({ days: -3 }, SH)).toEqual({ from: today, to: today });
    expect(resolveRange({ days: 'abc' }, SH)).toEqual({ from: today, to: today });
  });

  it('from/to 优先于 range（显式压过快捷）', () => {
    expect(resolveRange({ from: '2026-01-01', to: '2026-01-02', range: 'year' }, SH)).toEqual({
      from: '2026-01-01',
      to: '2026-01-02',
    });
  });
});

describe('parseLooseDay —— 口语日期', () => {
  const today = todayIn(SH);

  it('相对天', () => {
    expect(parseLooseDay('今天', SH)).toBe(today);
    expect(parseLooseDay('today', SH)).toBe(today);
    expect(parseLooseDay('昨天', SH)).toBe(shiftDay(today, -1));
    expect(parseLooseDay('前天', SH)).toBe(shiftDay(today, -2));
    expect(parseLooseDay('明天', SH)).toBe(shiftDay(today, 1));
    expect(parseLooseDay('后天', SH)).toBe(shiftDay(today, 2));
    expect(parseLooseDay('+3天', SH)).toBe(shiftDay(today, 3));
    expect(parseLooseDay('-2d', SH)).toBe(shiftDay(today, -2));
  });

  it('标准日期直接通过', () => {
    expect(parseLooseDay('2026-10-12', SH)).toBe('2026-10-12');
  });

  it('周几解析到未来最近的那一天', () => {
    const cur = new Date(`${today}T12:00:00Z`).getUTCDay();
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    for (const [zh, dow] of Object.entries(map)) {
      const got = parseLooseDay(`周${zh}`, SH)!;
      expect(got).not.toBeNull();
      expect(new Date(`${got}T12:00:00Z`).getUTCDay()).toBe(dow);
      const delta = daysBetween(today, got);
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(6);
    }
  });

  it('下周X 落在下一周（严格大于 7 天内）', () => {
    const got = parseLooseDay('下周三', SH)!;
    expect(got).not.toBeNull();
    expect(daysBetween(today, got)).toBeGreaterThanOrEqual(7);
    expect(daysBetween(today, got)).toBeLessThanOrEqual(13);
    expect(new Date(`${got}T12:00:00Z`).getUTCDay()).toBe(3);
  });

  it('解析不了的返回 null（区别于 normDay 的回退今天）', () => {
    expect(parseLooseDay('随便', SH)).toBeNull();
    expect(parseLooseDay('', SH)).toBeNull();
    expect(parseLooseDay('下个月', SH)).toBeNull();
  });
});

describe('atTimeOfDay —— 本地时刻转时间戳', () => {
  it('往返一致：转成 UTC 再按原时区格式化，应回到原值', () => {
    const cases: Array<[string, string, string]> = [
      ['2026-10-10', '12:00', SH],
      ['2026-10-10', '00:05', SH],
      ['2026-10-10', '23:59', SH],
      ['2026-07-04', '12:00', NY],
      ['2026-01-15', '09:30', NY],
      ['2026-10-10', '18:00', UTC],
      ['2026-10-10', '07:15', 'Asia/Tokyo'],
    ];
    for (const [day, hm, tz] of cases) {
      expect(fmtIn(atTimeOfDay(day, hm, tz), tz)).toBe(`${day} ${hm}`);
    }
  });

  it('上海 12:00 对应 UTC 04:00', () => {
    expect(atTimeOfDay('2026-10-10', '12:00', SH)).toBe('2026-10-10T04:00:00.000Z');
  });

  it('美东夏令时与冬令时的偏移不同（12:00 → 16:00Z / 17:00Z）', () => {
    expect(atTimeOfDay('2026-07-15', '12:00', NY)).toBe('2026-07-15T16:00:00.000Z');
    expect(atTimeOfDay('2026-01-15', '12:00', NY)).toBe('2026-01-15T17:00:00.000Z');
  });

  it('默认 12:00（用于补记往日数据）', () => {
    expect(atTimeOfDay('2026-10-10', undefined, SH)).toBe(atTimeOfDay('2026-10-10', '12:00', SH));
  });
});

describe('humanDay', () => {
  it('给出月-日与星期', () => {
    expect(humanDay('2026-10-12')).toBe('10-12 周一');
    expect(humanDay('2026-10-10')).toBe('10-10 周六');
  });
});
