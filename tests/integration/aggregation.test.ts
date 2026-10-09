/**
 * 集成测试：聚合层（getDay / finance / overview / digest）。
 * 这里是「SQL 类型推断」「字段命名契约」类 bug 的高发区，用例都标了回归原因。
 */
import { describe, expect, it } from 'vitest';
import { hasDb, useTestDb, daysAgo } from '../helpers/db';
import { createEntry, queryEntries, updateEntry, deleteEntry } from '@/lib/entries';
import { completeTask, createTask } from '@/lib/tasks';
import { checkHabit, ensureDefaultHabits } from '@/lib/habits';
import { getDay, loggingStreak, saveSummary } from '@/lib/day';
import { financeSummary, frequentCategories } from '@/lib/finance';
import { overview } from '@/lib/stats';
import { digest } from '@/lib/digest';
import { todayIn } from '@/lib/dates';

const TZ = 'Asia/Shanghai';
const today = todayIn(TZ);
const U = 'test-user';

describe.skipIf(!hasDb)('统一流水 entries', () => {
  useTestDb();

  it('写入时按用户时区归属到正确的那一天', async () => {
    const e = await createEntry(U, TZ, { kind: 'idea', content: '想到一个点子' });
    expect(e.day).toBe(today);
    expect(e.day).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 回归：date 不能变成 ISO 时间串
    expect(e.happened_at).toBeTruthy();
    expect(e.tags).toEqual([]);
    expect(e.meta).toEqual({});
  });

  it('可以补记到指定日期', async () => {
    const e = await createEntry(U, TZ, { kind: 'note', content: '三天前的事', day: daysAgo(3) });
    expect(e.day).toBe(daysAgo(3));
  });

  it('检索：按类型 / 时间段 / 关键词 / 标签 / 条数', async () => {
    await createEntry(U, TZ, { kind: 'idea', content: '关于健身的想法', tags: ['健康'] });
    await createEntry(U, TZ, { kind: 'note', content: '健身记录', tags: ['健康', '运动'] });
    await createEntry(U, TZ, { kind: 'expense', amount: 35, category: '餐饮', title: '午饭' });
    await createEntry(U, TZ, { kind: 'idea', content: '很久以前', day: daysAgo(40) });

    expect((await queryEntries(U, TZ, { kind: 'idea' })).length).toBe(1); // 默认区间是今天
    expect((await queryEntries(U, TZ, { kind: 'idea', days: 60 })).length).toBe(2);
    expect((await queryEntries(U, TZ, { days: 60, tags: ['健康'] })).length).toBe(2);
    expect((await queryEntries(U, TZ, { days: 60, q: '健身' })).length).toBe(2);
    expect((await queryEntries(U, TZ, { days: 60, limit: 1 })).length).toBe(1);
    expect((await queryEntries(U, TZ, { kind: ['idea', 'note'], days: 60 })).length).toBe(3);
  });

  it('软删除后查不到', async () => {
    const e = await createEntry(U, TZ, { kind: 'idea', content: 'temp' });
    expect(await deleteEntry(U, e.id)).toBe(true);
    expect(await queryEntries(U, TZ, { kind: 'idea' })).toHaveLength(0);
    expect(await deleteEntry(U, e.id)).toBe(false); // 幂等
  });

  it('更新流水', async () => {
    const e = await createEntry(U, TZ, { kind: 'expense', amount: 10, category: '餐饮' });
    const up = await updateEntry(U, e.id, { amount: 25, category: '购物', tags: ['修一下'] });
    expect(Number(up!.amount)).toBe(25);
    expect(up!.category).toBe('购物');
    expect(up!.tags).toEqual(['修一下']);
  });

  it('数值型流水保留单位为 category 与 meta.unit', async () => {
    const e = await createEntry(U, TZ, { kind: 'weight', amount: 70.5, category: 'kg', meta: { unit: 'kg' } });
    expect(Number(e.amount)).toBe(70.5);
    expect(e.category).toBe('kg');
    expect(e.meta.unit).toBe('kg');
  });

  it('金额精度不被浮点吃掉（numeric 而不是 float）', async () => {
    const e = await createEntry(U, TZ, { kind: 'expense', amount: 0.1 });
    const e2 = await createEntry(U, TZ, { kind: 'expense', amount: 0.2 });
    expect(Number(e.amount) + Number(e2.amount)).toBeCloseTo(0.3, 10);
    const s = await financeSummary(U, TZ, { days: 1 });
    expect(s.expense).toBeCloseTo(0.3, 10);
  });
});

describe.skipIf(!hasDb)('getDay —— 一天全貌（输出契约）', () => {
  useTestDb();

  it('待办 / 完成 / 逾期 / 收集箱 四类分流正确', async () => {
    await createTask(U, TZ, { title: '今天做', planned_day: '今天' });
    await createTask(U, TZ, { title: '明天做', planned_day: '明天' });
    await createTask(U, TZ, { title: '收集箱', planned_day: null });
    await createTask(U, TZ, { title: '老早该做', planned_day: daysAgo(3) });
    const d1 = await createTask(U, TZ, { title: '已完成', planned_day: '今天' });
    await completeTask(U, TZ, d1.id);

    const d = await getDay(U, TZ);
    expect(d.day).toBe(today);
    expect(d.isToday).toBe(true);
    expect(d.tasks.planned.map((t) => t.title)).toEqual(['今天做']);
    expect(d.tasks.done.map((t) => t.title)).toEqual(['已完成']);
    expect(d.tasks.overdue.map((t) => t.title)).toEqual(['老早该做']);
    expect(d.tasks.inbox.map((t) => t.title)).toEqual(['收集箱']);
    expect(d.tasks.counts).toMatchObject({ planned: 1, done: 1, overdue: 1, inbox: 1 });
  });

  it('回归：overdue / pending 必须带 planned_day 字段（页面曾因字段名不一致显示不出日期）', async () => {
    await createTask(U, TZ, { title: '过期的事', planned_day: daysAgo(3) });
    const d = await getDay(U, TZ);
    for (const t of [...d.tasks.overdue, ...d.tasks.planned, ...d.tasks.inbox, ...d.tasks.done]) {
      expect(t).toHaveProperty('planned_day');
      expect(t).toHaveProperty('done_at');
    }
    expect(d.tasks.overdue[0].planned_day).toBe(daysAgo(3));
  });

  it('流水按 kind 分组；任务完成镜像不进 entries.done（避免和完成榜重复）', async () => {
    await createEntry(U, TZ, { kind: 'idea', content: 'A' });
    await createEntry(U, TZ, { kind: 'idea', content: 'B' });
    await createEntry(U, TZ, { kind: 'note', content: 'C' });
    await createEntry(U, TZ, { kind: 'done', title: '手工记的完成' });
    const t = await createTask(U, TZ, { title: '任务完成', planned_day: '今天' });
    await completeTask(U, TZ, t.id);

    const d = await getDay(U, TZ);
    expect(d.entries.idea).toHaveLength(2);
    expect(d.entries.note).toHaveLength(1);
    // 手工记的 done 保留
    expect(d.entries.done.map((e) => e.title)).toEqual(['手工记的完成']);
    // 任务镜像的那条只在完成榜里
    expect(d.tasks.done.map((t) => t.title)).toEqual(['任务完成']);
  });

  it('习惯打卡状态与达标判定正确', async () => {
    await ensureDefaultHabits(U);
    await checkHabit(U, TZ, '运动');
    await checkHabit(U, TZ, '喝水', { value: 2, set: true });
    const d = await getDay(U, TZ);
    const sport = d.habits.find((h) => h.name === '运动')!;
    const water = d.habits.find((h) => h.name === '喝水')!;
    expect(sport.done).toBe(true);
    expect(water.value).toBe(2);
    expect(water.done).toBe(false); // 目标 8 杯，只喝 2 杯不算达标
  });

  it('收支汇总与明细', async () => {
    await createEntry(U, TZ, { kind: 'expense', amount: 35, category: '餐饮' });
    await createEntry(U, TZ, { kind: 'expense', amount: 12.5, category: '交通' });
    await createEntry(U, TZ, { kind: 'income', amount: 800, category: '报销' });
    const d = await getDay(U, TZ);
    expect(d.finance.expense).toBeCloseTo(47.5, 6);
    expect(d.finance.income).toBeCloseTo(800, 6);
    expect(d.finance.items).toHaveLength(3);
  });

  it('回归：finance.items 必须带 happened_at（页面曾因此显示 Invalid Date）', async () => {
    await createEntry(U, TZ, { kind: 'expense', amount: 10 });
    const d = await getDay(U, TZ);
    expect(d.finance.items[0].happened_at).toBeTruthy();
    expect(Number.isNaN(new Date(d.finance.items[0].happened_at).getTime())).toBe(false);
  });

  it('查任意一天（非今天）', async () => {
    await createEntry(U, TZ, { kind: 'note', content: '前天写的', day: daysAgo(2) });
    const d = await getDay(U, TZ, daysAgo(2));
    expect(d.day).toBe(daysAgo(2));
    expect(d.isToday).toBe(false);
    expect(d.entries.note).toHaveLength(1);
  });

  it('非法日期回退到今天而不是报错', async () => {
    const d = await getDay(U, TZ, '2026-13-45');
    expect(d.day).toBe(today);
  });
});

describe.skipIf(!hasDb)('每日总结与连续记录', () => {
  useTestDb();

  it('saveSummary 是 upsert：多次调用只更新不重复插入', async () => {
    await saveSummary(U, TZ, { day: today, summary: '第一版' });
    await saveSummary(U, TZ, { day: today, mood: 4 });
    await saveSummary(U, TZ, { summary: '第二版' });
    const d = await getDay(U, TZ);
    expect(d.summary?.summary).toBe('第二版');
    expect(d.summary?.mood).toBe(4);
  });

  it('部分更新不会清掉已有字段', async () => {
    await saveSummary(U, TZ, { day: today, summary: '保留我', mood: 5, energy: 2 });
    await saveSummary(U, TZ, { day: today, energy: 4 });
    const d = await getDay(U, TZ);
    expect(d.summary?.summary).toBe('保留我');
    expect(d.summary?.mood).toBe(5);
    expect(d.summary?.energy).toBe(4);
  });

  it('loggingStreak 统计连续有记录的天数', async () => {
    expect(await loggingStreak(U, TZ)).toBe(0);
    await createEntry(U, TZ, { kind: 'note', content: '今天', day: today });
    expect(await loggingStreak(U, TZ)).toBe(1);
    await createEntry(U, TZ, { kind: 'note', content: '昨天', day: daysAgo(1) });
    await createEntry(U, TZ, { kind: 'note', content: '前天', day: daysAgo(2) });
    expect(await loggingStreak(U, TZ)).toBe(3);
    // 断开一天就重算
    await createEntry(U, TZ, { kind: 'note', content: '大前天', day: daysAgo(4) });
    expect(await loggingStreak(U, TZ)).toBe(3);
  });

  it('今天还没记时，连续天数从昨天算（不会因为「今天还没写」清零）', async () => {
    await createEntry(U, TZ, { kind: 'note', content: '昨天', day: daysAgo(1) });
    await createEntry(U, TZ, { kind: 'note', content: '前天', day: daysAgo(2) });
    expect(await loggingStreak(U, TZ)).toBe(2);
  });
});

describe.skipIf(!hasDb)('财务与统计聚合', () => {
  useTestDb();

  it('financeSummary：总额 / 净额 / 分类 / 逐日补齐 / 最大支出', async () => {
    await createEntry(U, TZ, { kind: 'expense', amount: 100, category: '餐饮', title: '大餐', day: today });
    await createEntry(U, TZ, { kind: 'expense', amount: 20, category: '交通', title: '打车', day: daysAgo(1) });
    await createEntry(U, TZ, { kind: 'income', amount: 500, category: '工资', day: daysAgo(2) });

    const s = await financeSummary(U, TZ, { from: daysAgo(3), to: today });
    expect(s.from).toBe(daysAgo(3));
    expect(s.to).toBe(today);
    expect(s.expense).toBeCloseTo(120, 6);
    expect(s.income).toBeCloseTo(500, 6);
    expect(s.net).toBeCloseTo(380, 6);
    expect(s.byCategory.find((c) => c.key === '餐饮')!.expense).toBeCloseTo(100, 6);
    // 逐日必须补齐 4 天（含 0 的日子），图表才画得对
    expect(s.byDay).toHaveLength(4);
    expect(s.byDay.map((d) => d.day)).toEqual([daysAgo(3), daysAgo(2), daysAgo(1), today]);
    expect(s.byDay[0].expense).toBe(0);
    expect(s.byDay[1].income).toBeCloseTo(500, 6);
    expect(s.topExpenses[0].title).toBe('大餐');
  });

  it('未分类支出归到「未分类」而不是被丢掉', async () => {
    await createEntry(U, TZ, { kind: 'expense', amount: 9.9 });
    const s = await financeSummary(U, TZ, { days: 1 });
    expect(s.byCategory.find((c) => c.key === '未分类')!.expense).toBeCloseTo(9.9, 6);
  });

  it('frequentCategories 带历史频次，并在前面补默认项', async () => {
    await createEntry(U, TZ, { kind: 'expense', amount: 1, category: '宠物' });
    await createEntry(U, TZ, { kind: 'expense', amount: 1, category: '宠物' });
    const list = await frequentCategories(U, 'expense');
    expect(list[0]).toBe('宠物');
    expect(list).toContain('餐饮');
  });

  it('overview：任务完成率 / 类型分布 / 指标 / 标签', async () => {
    const t1 = await createTask(U, TZ, { title: 'A', planned_day: '今天' });
    await createTask(U, TZ, { title: 'B', planned_day: '今天' });
    await completeTask(U, TZ, t1.id);
    await createEntry(U, TZ, { kind: 'weight', amount: 70, category: 'kg', tags: ['健康'] });
    await createEntry(U, TZ, { kind: 'weight', amount: 71, category: 'kg', tags: ['健康'] });
    await createEntry(U, TZ, { kind: 'sleep', amount: 7.5, category: '小时' });
    await createEntry(U, TZ, { kind: 'expense', amount: 30, category: '餐饮' });

    const ov = await overview(U, TZ, { days: 7 });
    expect(ov.tasks.created).toBe(2);
    expect(ov.tasks.done).toBe(1);
    expect(ov.tasks.rate).toBeCloseTo(0.5, 3);
    expect(ov.activeDays).toBe(1);
    expect(ov.entries).toBe(5);

    const weight = ov.metrics.find((m) => m.kind === 'weight')!;
    expect(weight.unit).toBe('kg');
    expect(weight.n).toBe(2);
    expect(weight.avg).toBeCloseTo(70.5, 3);
    expect(weight.min).toBe(70);
    expect(weight.max).toBe(71);
    expect(weight.last).toBe(71);

    expect(ov.topTags.find((t) => t.tag === '健康')!.n).toBe(2);
    expect(ov.finance.expense).toBeCloseTo(30, 6);
    expect(ov.daily).toHaveLength(7); // 逐日补齐
  });

  it('回归：overview 在文本型日期区间上不报 operator does not exist', async () => {
    // 曾经 tasks 相关子查询里 $2/$3 是 text 却被当 date 比较
    await expect(overview(U, TZ, { from: daysAgo(30), to: today })).resolves.toBeDefined();
  });

  it('空数据时各项都是 0，不抛错', async () => {
    const ov = await overview(U, TZ, { days: 30 });
    expect(ov.entries).toBe(0);
    expect(ov.activeDays).toBe(0);
    expect(ov.tasks.rate).toBe(0);
    expect(ov.finance.expense).toBe(0);
    expect(ov.metrics).toHaveLength(0);
    expect(ov.habits).toHaveLength(0);
  });
});

describe.skipIf(!hasDb)('digest —— 喂给大模型的 Markdown', () => {
  useTestDb();

  it('包含概览、逐日明细与待办现状三段', async () => {
    await createEntry(U, TZ, { kind: 'expense', amount: 35, category: '餐饮', title: '午饭' });
    await createEntry(U, TZ, { kind: 'idea', content: '做个生活记录站' });
    await createEntry(U, TZ, { kind: 'weight', amount: 70.5, category: 'kg' });
    await createTask(U, TZ, { title: '还没做的事', planned_day: '今天' });
    const t = await createTask(U, TZ, { title: '已经做完的事', planned_day: '今天' });
    await completeTask(U, TZ, t.id);
    await saveSummary(U, TZ, { day: today, summary: '今天还行', mood: 4, energy: 3 });

    const md = await digest(U, TZ, { days: 7 }, { days: 7 });
    expect(md).toContain('生活记录');
    expect(md).toContain('## 区间概览');
    expect(md).toContain('## 逐日明细');
    expect(md).toContain('## 待办现状');
    expect(md).toContain(today);
    expect(md).toContain('午饭');
    expect(md).toContain('做个生活记录站');
    expect(md).toContain('已经做完的事');
    expect(md).toContain('- [ ] 还没做的事');
    expect(md).toContain('今天还行');
    expect(md).toContain('心情 4/5');
    expect(md).toContain('支出 ¥35.00');
  });

  it('空数据也能生成（不抛错、有骨架）', async () => {
    const md = await digest(U, TZ, { days: 3 }, { days: 3 });
    expect(md).toContain('生活记录');
    expect(md).toContain('（当前没有未完成待办）');
  });

  it('max_days 限制展开的天数', async () => {
    for (const d of [daysAgo(1), daysAgo(2)]) {
      await createEntry(U, TZ, { kind: 'note', content: `第 ${d} 天`, day: d });
    }
    const md = await digest(U, TZ, { days: 30 }, { days: 1 });
    expect(md).not.toContain(daysAgo(2));
  });
});
