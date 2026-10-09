/**
 * 集成测试：待办与习惯的完整生命周期（跑真 Postgres）。
 * 覆盖点里带「回归」标记的，都是之前真踩过的坑。
 */
import { describe, expect, it } from 'vitest';
import { hasDb, ctx, useTestDb, daysAgo } from '../helpers/db';
import {
  completeTask,
  createTask,
  deleteTask,
  doneOn,
  listTasks,
  postponeTask,
  taskCounts,
  updateTask,
} from '@/lib/tasks';
import { queryEntries } from '@/lib/entries';
import {
  checkHabit,
  deleteHabit,
  ensureDefaultHabits,
  findHabit,
  habitStats,
  listHabits,
  uncheckHabit,
  upsertHabit,
} from '@/lib/habits';
import { todayIn } from '@/lib/dates';

const TZ = 'Asia/Shanghai';
const today = todayIn(TZ);

describe.skipIf(!hasDb)('待办生命周期', () => {
  useTestDb();

  it('创建 → 出现在今日计划里 → 字段完整', async () => {
    const t = await createTask('test-user', TZ, { title: '写周报', planned_day: '今天', priority: 2, tags: ['工作'] });
    expect(t.id).toBeGreaterThan(0);
    expect(t.status).toBe('pending');
    expect(t.priority).toBe(2);
    // 回归：planned_day 必须是 'YYYY-MM-DD' 字符串，不能是 ISO 时间串
    // （pg 的 date 若被转成 JS Date，JSON 化后会变成 2026-10-10T00:00:00.000Z，前端日期框与 AI 都用不了）
    expect(t.planned_day).toBe(today);
    expect(t.planned_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.tags).toEqual(['工作']);
  });

  it('口语日期入参被正确解析（今天/明天/周一）', async () => {
    const t = await createTask('test-user', TZ, { title: '明天的事', planned_day: '明天' });
    expect(t.planned_day).toBe(daysAgo(-1));
    expect(t.planned_day).not.toBe(today);
  });

  it('planned_day 三级语义：给日期→那天；不给→今天；显式 null → 收集箱', async () => {
    expect((await createTask('test-user', TZ, { title: '给了日期', planned_day: '明天' })).planned_day).toBe(daysAgo(-1));
    expect((await createTask('test-user', TZ, { title: '没给' })).planned_day).toBe(today);
    expect((await createTask('test-user', TZ, { title: '显式空' })).planned_day).toBe(today);
    expect((await createTask('test-user', TZ, { title: '收集箱', planned_day: null })).planned_day).toBeNull();
    expect((await createTask('test-user', TZ, { title: '空串', planned_day: '' })).planned_day).toBeNull();
  });

  it('listTasks 各状态筛选', async () => {
    await createTask('test-user', TZ, { title: '今天的', planned_day: '今天' });
    await createTask('test-user', TZ, { title: '明天的', planned_day: '明天' });
    await createTask('test-user', TZ, { title: '收集箱的', planned_day: null });
    const old = await createTask('test-user', TZ, { title: '逾期的', planned_day: daysAgo(3) });
    void old;

    const t = await listTasks('test-user', TZ, { state: 'today' });
    expect(t.map((x) => x.title)).toEqual(['今天的']);

    // 回归：「未完成」必须包含计划在未来的任务，
    // 否则它只在「全部」里可见，用户会以为任务丢了
    const p = await listTasks('test-user', TZ, { state: 'pending' });
    expect(p.map((x) => x.title).sort()).toEqual(['今天的', '明天的', '逾期的', '收集箱的'].sort());
    expect(p.map((x) => x.title)).toContain('明天的');

    const o = await listTasks('test-user', TZ, { state: 'overdue' });
    expect(o.map((x) => x.title)).toEqual(['逾期的']);
  });

  it('完成任务会镜像写一条 kind=done 流水，且指向 task_id', async () => {
    const t = await createTask('test-user', TZ, { title: '交房租', planned_day: '今天', tags: ['生活'] });
    const r = await completeTask('test-user', TZ, t.id, { source: 'web' });
    expect(r).not.toBeNull();
    expect(r!.task.status).toBe('done');
    expect(r!.task.done_at).not.toBeNull();

    const done = await queryEntries('test-user', TZ, { kind: 'done' });
    expect(done).toHaveLength(1);
    expect(done[0].title).toBe('交房租');
    expect(done[0].task_id).toBe(t.id);
    expect(done[0].day).toBe(today);
    expect(done[0].tags).toEqual(['生活']);
  });

  it('支持用标题关键词完成任务（AI 常用这种说法）', async () => {
    await createTask('test-user', TZ, { title: '看完 Qwen 部署文档', planned_day: '今天' });
    const r = await completeTask('test-user', TZ, 'Qwen');
    expect(r!.task.title).toBe('看完 Qwen 部署文档');
  });

  it('找不到任务时返回 null 而不是抛错', async () => {
    expect(await completeTask('test-user', TZ, '根本不存在的任务')).toBeNull();
  });

  it('补记往日完成：done_at 落在指定那天', async () => {
    const t = await createTask('test-user', TZ, { title: '上周做的事', planned_day: daysAgo(7) });
    const day = daysAgo(5);
    await completeTask('test-user', TZ, t.id, { day });
    const done = await doneOn('test-user', TZ, day);
    expect(done.map((x) => x.title)).toEqual(['上周做的事']);
    expect(await doneOn('test-user', TZ, daysAgo(4))).toHaveLength(0);
  });

  it('撤销完成会把 done_at 清空（否则会一直挂在完成榜上）', async () => {
    const t = await createTask('test-user', TZ, { title: '手滑点错', planned_day: '今天' });
    await completeTask('test-user', TZ, t.id);
    const back = await updateTask('test-user', TZ, t.id, { status: 'pending' });
    expect(back!.status).toBe('pending');
    expect(back!.done_at).toBeNull();
    expect(await doneOn('test-user', TZ, today)).toHaveLength(0);
  });

  it('顺延默认到明天，也可以指定日期', async () => {
    const t = await createTask('test-user', TZ, { title: '拖一下', planned_day: '今天' });
    const plus1 = await postponeTask('test-user', TZ, t.id);
    expect(plus1!.planned_day).toBe(daysAgo(-1));
    const target = daysAgo(-10);
    const later = await postponeTask('test-user', TZ, t.id, target);
    expect(later!.planned_day).toBe(target);
  });

  it('删除任务会连带软删它镜像出来的流水', async () => {
    const t = await createTask('test-user', TZ, { title: '不要了', planned_day: '今天' });
    await completeTask('test-user', TZ, t.id);
    expect(await queryEntries('test-user', TZ, { kind: 'done' })).toHaveLength(1);
    // 注意：deleteTask 签名是 (userId, ref)，不接收 tz（纯 id/标题查找）
    expect(await deleteTask('test-user', t.id)).toBe(true);
    expect(await queryEntries('test-user', TZ, { kind: 'done' })).toHaveLength(0);
    expect(await listTasks('test-user', TZ, { state: 'all' })).toHaveLength(0);
  });

  it('taskCounts 四个维度统计正确', async () => {
    await createTask('test-user', TZ, { title: 'A', planned_day: '今天' });
    await createTask('test-user', TZ, { title: 'B', planned_day: '今天' });
    await createTask('test-user', TZ, { title: 'C', planned_day: null });
    const overdue = await createTask('test-user', TZ, { title: 'D', planned_day: daysAgo(2) });
    const doneOne = await createTask('test-user', TZ, { title: 'E', planned_day: '今天' });
    await completeTask('test-user', TZ, doneOne.id);
    void overdue;

    const c = await taskCounts('test-user', TZ);
    expect(c.planned).toBe(2); // A B
    expect(c.inbox).toBe(1); // C
    expect(c.overdue).toBe(1); // D
    expect(c.done).toBe(1); // E
  });

  it('回归：taskCounts 不因 SQL 参数类型推断报错', async () => {
    // 以前同一个 $2 既当 date 又当 text 比，Postgres 会推成 date 然后另一边报
    // 「operator does not exist: text = date」
    await expect(taskCounts('test-user', TZ, today)).resolves.toBeDefined();
  });
});

describe.skipIf(!hasDb)('习惯打卡', () => {
  useTestDb();

  it('首次使用自动建默认习惯，且只建一次', async () => {
    const a = await ensureDefaultHabits('test-user');
    expect(a.length).toBeGreaterThan(5);
    const b = await ensureDefaultHabits('test-user');
    expect(b.length).toBe(a.length);
    expect(await listHabits('test-user', true)).toHaveLength(a.length);
  });

  it('checkHabit 在没有任何习惯时会自动初始化（否则 AI 第一次打卡必然失败）', async () => {
    const log = await checkHabit('test-user', TZ, '运动');
    expect(log).not.toBeNull();
    expect(Number(log!.value)).toBe(1);
  });

  it('bool 型重复打卡是幂等的，不会累加', async () => {
    await ensureDefaultHabits('test-user');
    await checkHabit('test-user', TZ, '早起');
    await checkHabit('test-user', TZ, '早起');
    const again = await checkHabit('test-user', TZ, '早起');
    expect(Number(again!.value)).toBe(1);
  });

  it('count 型默认累加，set:true 直接设值', async () => {
    await ensureDefaultHabits('test-user');
    await checkHabit('test-user', TZ, '喝水');
    await checkHabit('test-user', TZ, '喝水');
    const three = await checkHabit('test-user', TZ, '喝水');
    expect(Number(three!.value)).toBe(3);
    const set = await checkHabit('test-user', TZ, '喝水', { value: 6, set: true });
    expect(Number(set!.value)).toBe(6);
  });

  it('取消打卡', async () => {
    await ensureDefaultHabits('test-user');
    await checkHabit('test-user', TZ, '运动');
    expect(await uncheckHabit('test-user', '运动', undefined, TZ)).toBe(true);
    const s = await habitStats('test-user', TZ, { days: 7 });
    const sport = s.find((x) => x.habit.name === '运动')!;
    expect(sport.cells[sport.cells.length - 1].value).toBe(0);
    expect(sport.doneDays).toBe(0);
  });

  it('habitStats：完成率、连续天数、达标判定', async () => {
    await upsertHabit('test-user', { name: '喝水', kind: 'count', target: 8, unit: '杯' });
    // 连续 3 天达标，第 4 天（今天）只喝 2 杯
    for (const [d, v] of [
      [daysAgo(3), 8],
      [daysAgo(2), 9],
      [daysAgo(1), 8],
      [today, 2],
    ] as Array<[string, number]>) {
      await checkHabit('test-user', TZ, '喝水', { day: d, value: v, set: true });
    }
    const stats = await habitStats('test-user', TZ, { from: daysAgo(3), to: today });
    expect(stats).toHaveLength(1);
    const s = stats[0];
    expect(s.totalDays).toBe(4);
    expect(s.doneDays).toBe(3); // 今天 2/8 不算达标
    expect(s.rate).toBeCloseTo(0.75, 5);
    expect(s.cells[s.cells.length - 1].value).toBe(2);
    // 连续天数从最近一天往前数，今天没达标 → 0
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(3);
  });

  it('habitStats 的 cells 覆盖区间每一天且补齐 0', async () => {
    await ensureDefaultHabits('test-user');
    await checkHabit('test-user', TZ, '运动', { day: daysAgo(2), value: 1, set: true });
    const stats = await habitStats('test-user', TZ, { from: daysAgo(3), to: today });
    const sport = stats.find((x) => x.habit.name === '运动')!;
    expect(sport.cells.map((c) => c.day)).toEqual([daysAgo(3), daysAgo(2), daysAgo(1), today]);
    expect(sport.cells.map((c) => c.value)).toEqual([0, 1, 0, 0]);
  });

  it('习惯名支持模糊匹配，但完全找不到时返回 null', async () => {
    await ensureDefaultHabits('test-user');
    expect((await findHabit('test-user', '喝'))!.name).toBe('喝水');
    expect(await findHabit('test-user', '不存在的习惯')).toBeNull();
    expect(await checkHabit('test-user', TZ, '不存在的习惯')).toBeNull();
  });

  it('删除习惯会连带删掉打卡记录', async () => {
    await ensureDefaultHabits('test-user');
    await checkHabit('test-user', TZ, '运动');
    await deleteHabit('test-user', '运动');
    expect(await listHabits('test-user', true)).not.toContainEqual(expect.objectContaining({ name: '运动' }));
    expect((await habitStats('test-user', TZ, { days: 7 })).find((x) => x.habit.name === '运动')).toBeUndefined();
  });
});
