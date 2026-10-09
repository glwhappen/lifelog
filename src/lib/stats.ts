import { q } from './db';
import { eachDay, resolveRange } from './dates';
import { habitStats } from './habits';

export interface Overview {
  from: string;
  to: string;
  activeDays: number;
  totalDays: number;
  entries: number;
  byKind: Array<{ kind: string; n: number }>;
  tasks: { created: number; done: number; rate: number };
  finance: { expense: number; income: number; net: number; byCategory: Array<{ key: string; expense: number }> };
  habits: Array<{ name: string; icon: string | null; doneDays: number; totalDays: number; rate: number; currentStreak: number }>;
  metrics: Array<{ kind: string; unit: string | null; avg: number | null; min: number | null; max: number | null; last: number | null; n: number }>;
  topTags: Array<{ tag: string; n: number }>;
  daily: Array<{ day: string; entries: number; done: number; expense: number; income: number }>;
}

const METRIC_KINDS = ['weight', 'sleep', 'mood', 'energy', 'water', 'focus', 'workout', 'reading'];

export async function overview(
  userId: string,
  tz: string,
  range: { from?: unknown; to?: unknown; days?: unknown; range?: unknown },
): Promise<Overview> {
  const { from, to } = resolveRange(range, tz);
  const args = [userId, from, to];

  // 这些查询互不依赖，并行发出（原来是一条条 await，白白串行等了好几趟）
  const [byKind, totals, taskRows] = await Promise.all([
    q<{ kind: string; n: number }>(
      `select kind, count(*)::int as n from entries
        where user_id = $1 and deleted_at is null and day between $2 and $3 group by kind order by n desc`,
      args,
    ),
    q<{ entries: number; active_days: number }>(
      `select count(*)::int as entries, count(distinct day)::int as active_days from entries
        where user_id = $1 and deleted_at is null and day between $2 and $3`,
      args,
    ),
    q<{ created: number; done: number }>(
    `select
       count(*) filter (where (created_at at time zone $4)::date between $2::text::date and $3::text::date)::int as created,
       count(*) filter (where status = 'done' and done_at is not null
              and (done_at at time zone $4)::date between $2::text::date and $3::text::date)::int as done
     from tasks where user_id = $1 and deleted_at is null`,
      [userId, from, to, tz],
    ),
  ]);

  const [fin, byCat, metrics, topTags, dailyRows, doneRows] = await Promise.all([
    q<{ expense: number; income: number }>(
      `select
         coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
         coalesce(sum(amount) filter (where kind = 'income'), 0) as income
       from entries where user_id = $1 and deleted_at is null and day between $2 and $3`,
      args,
    ),
    q<{ key: string; expense: number }>(
      `select coalesce(category,'未分类') as key, coalesce(sum(amount),0) as expense from entries
        where user_id = $1 and deleted_at is null and kind = 'expense' and day between $2 and $3
        group by 1 order by expense desc limit 12`,
      args,
    ),
    q<any>(
      `select kind, category as unit,
              avg(amount) as avg, min(amount) as min, max(amount) as max, count(*)::int as n,
              (array_agg(amount order by day desc, id desc))[1] as last
         from entries
        where user_id = $1 and deleted_at is null and day between $2 and $3
          and amount is not null and kind = any($4)
        group by kind, category order by kind`,
      [userId, from, to, METRIC_KINDS],
    ),
    q<{ tag: string; n: number }>(
      `select t.tag, count(*)::int as n
         from entries e, unnest(e.tags) as t(tag)
        where e.user_id = $1 and e.deleted_at is null and e.day between $2 and $3
        group by t.tag order by n desc limit 20`,
      args,
    ),
    q<{ day: string; entries: number; done: number; expense: number; income: number }>(
      `select to_char(day,'YYYY-MM-DD') as day,
              count(*)::int as entries,
              0 as done,
              coalesce(sum(amount) filter (where kind = 'expense'),0) as expense,
              coalesce(sum(amount) filter (where kind = 'income'),0) as income
         from entries where user_id = $1 and deleted_at is null and day between $2 and $3
        group by 1`,
      args,
    ),
    q<{ day: string; done: number }>(
      `select to_char(done_at at time zone $4, 'YYYY-MM-DD') as day, count(*)::int as done from tasks
        where user_id = $1 and deleted_at is null and status = 'done'
          and done_at is not null and (done_at at time zone $4)::date between $2::text::date and $3::text::date
        group by 1`,
      [userId, from, to, tz],
    ),
  ]);

  const hstats = await habitStats(userId, tz, { from, to });

  // 把「逐日」补齐成连续日期：图表要按天画，缺的日子必须补 0
  const days = eachDay(from, to);
  const doneMap = new Map(doneRows.map((r) => [r.day, r.done]));
  const dailyMap = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = days.map((d) => ({
    day: d,
    entries: Number(dailyMap.get(d)?.entries ?? 0),
    done: Number(doneMap.get(d) ?? 0),
    expense: Number(dailyMap.get(d)?.expense ?? 0),
    income: Number(dailyMap.get(d)?.income ?? 0),
  }));

  const t = totals[0] ?? { entries: 0, active_days: 0 };
  const tr = taskRows[0] ?? { created: 0, done: 0 };
  const f = fin[0] ?? { expense: 0, income: 0 };

  return {
    from,
    to,
    activeDays: Number(t.active_days),
    totalDays: days.length,
    entries: Number(t.entries),
    byKind,
    tasks: {
      created: Number(tr.created),
      done: Number(tr.done),
      rate: Number(tr.created) ? Number(tr.done) / Number(tr.created) : 0,
    },
    finance: {
      expense: Number(f.expense),
      income: Number(f.income),
      net: Number(f.income) - Number(f.expense),
      byCategory: byCat,
    },
    habits: hstats.map((h) => ({
      name: h.habit.name,
      icon: h.habit.icon,
      doneDays: h.doneDays,
      totalDays: h.totalDays,
      rate: h.rate,
      currentStreak: h.currentStreak,
    })),
    metrics: metrics.map((m) => ({
      kind: m.kind,
      unit: m.unit ?? null,
      avg: m.avg === null ? null : Math.round(Number(m.avg) * 100) / 100,
      min: m.min === null ? null : Number(m.min),
      max: m.max === null ? null : Number(m.max),
      last: m.last === null ? null : Number(m.last),
      n: Number(m.n),
    })),
    topTags,
    daily,
  };
}
