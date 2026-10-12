import { describe, expect, it } from 'vitest';
import {
  anniversariesToday,
  computeCounter,
  counterSummary,
  sameDayInYear,
  sortForDisplay,
  upcoming,
  yearlyInfo,
  type Counter,
} from '@/lib/counters';

/** 造一条纪念日记录 */
function C(over: Partial<Counter> = {}): Counter {
  return {
    id: 1,
    user_id: 'u',
    name: '结婚纪念日',
    icon: 'gem',
    start_day: '2020-05-20',
    mode: 'since',
    repeat: 'none',
    color: null,
    note: null,
    sort: 0,
    active: true,
    created_at: '',
    ...over,
  };
}

describe('sameDayInYear —— 同月同日', () => {
  it('普通日期直接拼', () => {
    expect(sameDayInYear('2020-05-20', 2026)).toBe('2026-05-20');
    expect(sameDayInYear('1995-12-01', 2030)).toBe('2030-12-01');
  });

  it('2-29 在闰年保留、平年退到 2-28（不能让它跳到 3-1）', () => {
    expect(sameDayInYear('2020-02-29', 2024)).toBe('2024-02-29'); // 闰年
    expect(sameDayInYear('2020-02-29', 2026)).toBe('2026-02-28'); // 平年
    expect(sameDayInYear('2020-02-29', 2100)).toBe('2100-02-28'); // 世纪年非闰
    expect(sameDayInYear('2020-02-29', 2000)).toBe('2000-02-29'); // 400 年闰
  });
});

describe('yearlyInfo —— 每年循环的周年', () => {
  it('今年这次已经过了：满了 6 周年，下一个是第 7 个', () => {
    const r = yearlyInfo('2020-05-20', '2026-10-10');
    expect(r.completed).toBe(6);
    expect(r.nextOrdinal).toBe(7);
    expect(r.nextDay).toBe('2027-05-20');
    expect(r.isAnniversaryToday).toBe(false);
    expect(r.daysToNext).toBeGreaterThan(200);
  });

  it('今天正好是周年：nextDay 就是今天，所以 nextOrdinal 是「今天这个」', () => {
    const r = yearlyInfo('2020-05-20', '2026-05-20');
    expect(r.completed).toBe(6);
    expect(r.nextOrdinal).toBe(6); // 目标就是今天这次，不是明年的第 7 次
    expect(r.nextDay).toBe('2026-05-20');
    expect(r.daysToNext).toBe(0);
    expect(r.isAnniversaryToday).toBe(true);
  });

  it('今年这次还没到：只满了 5 周年，下一个就是今年这次', () => {
    const r = yearlyInfo('2020-05-20', '2026-01-15');
    expect(r.completed).toBe(5);
    expect(r.nextOrdinal).toBe(6);
    expect(r.nextDay).toBe('2026-05-20');
    expect(r.daysToNext).toBeGreaterThan(100);
  });

  it('起始当年就查询（还没满 1 周年）', () => {
    const r = yearlyInfo('2026-05-20', '2026-06-01');
    expect(r.completed).toBe(0);
    expect(r.nextOrdinal).toBe(1);
  });

  it('跨年边界：12-31 与 01-01', () => {
    expect(yearlyInfo('2020-12-31', '2026-12-31').daysToNext).toBe(0); // 就是今天
    // 2020-12-31 起，到 2027-01-01 已经过了 2021..2026 共 6 次，下一次是 2027-12-31
    const r = yearlyInfo('2020-12-31', '2027-01-01');
    expect(r.completed).toBe(6);
    expect(r.nextDay).toBe('2027-12-31');
    expect(yearlyInfo('2020-01-01', '2026-12-31').completed).toBe(6);
  });
});

describe('computeCounter —— 累计（第 N 天）', () => {
  it('起始当天就是第 1 天', () => {
    const v = computeCounter(C({ start_day: '2026-10-10' }), '2026-10-10');
    expect(v.ordinal).toBe(1);
    expect(v.days).toBe(0);
    expect(v.label).toBe('第 1 天');
    expect(v.isToday).toBe(true);
  });

  it('第二天是第 2 天', () => {
    const v = computeCounter(C({ start_day: '2026-10-09' }), '2026-10-10');
    expect(v.ordinal).toBe(2);
    expect(v.days).toBe(1);
    expect(v.isToday).toBe(false);
  });

  it('离职第 N 天：跨月跨年都算对', () => {
    expect(computeCounter(C({ mode: 'since', start_day: '2026-10-01' }), '2026-10-10').ordinal).toBe(10);
    expect(computeCounter(C({ mode: 'since', start_day: '2025-10-01' }), '2026-10-10').ordinal).toBe(375);
  });

  it('带 yearly：既给第 N 天，也给已满周年与距下一个的天数', () => {
    const v = computeCounter(C({ mode: 'since', repeat: 'yearly' }), '2026-10-10');
    expect(v.label).toBe('第 2335 天');
    expect(v.years).toBe(6);
    expect(v.nextDay).toBe('2027-05-20');
    expect(v.daysToNext).toBeGreaterThan(0);
  });

  it('带 yearly 且今天就是纪念日 → isToday', () => {
    const v = computeCounter(C({ mode: 'since', repeat: 'yearly' }), '2026-05-20');
    expect(v.isToday).toBe(true);
    expect(v.daysToNext).toBe(0);
  });
});

describe('computeCounter —— 倒计时（还有 N 天）', () => {
  it('一次性倒计时', () => {
    const v = computeCounter(C({ mode: 'until', start_day: '2026-10-20' }), '2026-10-10');
    expect(v.days).toBe(10);
    expect(v.label).toBe('还有 10 天');
    expect(v.years).toBeNull();
  });

  it('就是今天', () => {
    const v = computeCounter(C({ mode: 'until', start_day: '2026-10-10' }), '2026-10-10');
    expect(v.daysToNext).toBe(0);
    expect(v.label).toBe('就是今天');
    expect(v.isToday).toBe(true);
  });

  it('已经过去的日子不会给出负数展示（但仍能被看出来）', () => {
    const v = computeCounter(C({ mode: 'until', start_day: '2026-10-01' }), '2026-10-10');
    expect(v.daysToNext).toBe(-9);
    expect(v.days).toBe(0);
  });

  it('生日倒计时（yearly）：给出第几个生日与剩余天数', () => {
    const v = computeCounter(C({ name: '生日', start_day: '1995-11-11', mode: 'until', repeat: 'yearly' }), '2026-10-10');
    expect(v.nextDay).toBe('2026-11-11');
    expect(v.daysToNext).toBe(32);
    expect(v.years).toBe(31); // 2026 - 1995
    expect(v.label).toBe('还有 32 天');
  });

  it('生日当天', () => {
    const v = computeCounter(C({ name: '生日', start_day: '1995-11-11', mode: 'until', repeat: 'yearly' }), '2026-11-11');
    expect(v.daysToNext).toBe(0);
    expect(v.isToday).toBe(true);
  });

  it('2-29 出生：平年按 2-28 算，不会跨到 3 月', () => {
    const v = computeCounter(C({ start_day: '2000-02-29', mode: 'until', repeat: 'yearly' }), '2026-02-01');
    expect(v.nextDay).toBe('2026-02-28');
    expect(v.daysToNext).toBe(27);
  });
});

describe('counterSummary —— 给界面与 AI 共用的一句话', () => {
  it('累计型', () => {
    expect(counterSummary(computeCounter(C({ mode: 'since', start_day: '2026-10-01' }), '2026-10-10'))).toBe(
      '结婚纪念日第 10 天',
    );
  });

  it('累计 + yearly：带上周年与距下一个', () => {
    const s = counterSummary(computeCounter(C({ repeat: 'yearly' }), '2026-10-10'));
    expect(s).toContain('第 2335 天');
    expect(s).toContain('6 周年');
  });

  it('倒计时型', () => {
    expect(counterSummary(computeCounter(C({ name: '生日', mode: 'until', start_day: '2026-10-20' }), '2026-10-10'))).toBe(
      '距离生日还有 10 天',
    );
  });

  it('今天就是', () => {
    expect(counterSummary(computeCounter(C({ name: '生日', mode: 'until', start_day: '2026-10-10' }), '2026-10-10'))).toBe(
      '今天就是生日',
    );
  });
});

describe('列表辅助', () => {
  const vs = [
    // 倒计时的才有「还有几天」；累计型（mode=since 且不循环）本来就是没有下一个的
    computeCounter(C({ id: 1, name: 'A', mode: 'until', start_day: '2026-10-20' }), '2026-10-10'), // 还有 10 天
    computeCounter(C({ id: 2, name: 'B', mode: 'until', start_day: '2026-10-10' }), '2026-10-10'), // 就是今天
    computeCounter(C({ id: 3, name: 'C', mode: 'until', start_day: '2027-06-01' }), '2026-10-10'), // 还有 234 天
    computeCounter(C({ id: 4, name: 'D', start_day: '2020-05-20' }), '2026-10-10'), // 累计型，没有下一个
  ];

  it('anniversariesToday 挑出今天到的', () => {
    expect(anniversariesToday(vs).map((v) => v.name)).toEqual(['B']);
  });

  it('upcoming 只留 30 天内的，并按临近排序', () => {
    expect(upcoming(vs, 30).map((v) => v.name)).toEqual(['A']);
  });

  it('sortForDisplay 把今天的排最前', () => {
    expect(sortForDisplay(vs)[0].name).toBe('B');
  });

  it('累计型不会被算进「即将到来」（它本来就没有下一个）', () => {
    expect(upcoming(vs, 9999).map((v) => v.name)).not.toContain('D');
  });
});
