import { q } from './db';
import { eachDay, resolveRange } from './dates';

export interface FinanceGroup {
  key: string;
  expense: number;
  income: number;
  count: number;
}

export interface FinanceSummary {
  from: string;
  to: string;
  expense: number;
  income: number;
  net: number;
  byCategory: FinanceGroup[];
  byDay: Array<{ day: string; expense: number; income: number }>;
  byMonth: Array<{ month: string; expense: number; income: number }>;
  topExpenses: Array<{ id: number; day: string; title: string | null; content: string | null; amount: number; category: string | null }>;
}

export async function financeSummary(
  userId: string,
  tz: string,
  range: { from?: unknown; to?: unknown; days?: unknown; range?: unknown },
): Promise<FinanceSummary> {
  const { from, to } = resolveRange(range, tz);
  const args = [userId, from, to];

  const totals = await q<{ expense: number; income: number; n: number }>(
    `select
       coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
       coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
       count(*)::int as n
     from entries
     where user_id = $1 and deleted_at is null and kind in ('expense','income') and day between $2 and $3`,
    args,
  );

  const byCategory = await q<FinanceGroup>(
    `select coalesce(category, '未分类') as key,
            coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
            coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
            count(*)::int as count
       from entries
      where user_id = $1 and deleted_at is null and kind in ('expense','income') and day between $2 and $3
      group by 1
      order by expense desc, income desc`,
    args,
  );

  const dayRows = await q<{ day: string; expense: number; income: number }>(
    `select to_char(day, 'YYYY-MM-DD') as day,
            coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
            coalesce(sum(amount) filter (where kind = 'income'), 0) as income
       from entries
      where user_id = $1 and deleted_at is null and kind in ('expense','income') and day between $2 and $3
      group by 1 order by 1`,
    args,
  );
  const dayMap = new Map(dayRows.map((r) => [r.day, r]));
  const byDay = eachDay(from, to).map((d) => ({
    day: d,
    expense: Number(dayMap.get(d)?.expense ?? 0),
    income: Number(dayMap.get(d)?.income ?? 0),
  }));

  const byMonth = await q<{ month: string; expense: number; income: number }>(
    `select to_char(day, 'YYYY-MM') as month,
            coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
            coalesce(sum(amount) filter (where kind = 'income'), 0) as income
       from entries
      where user_id = $1 and deleted_at is null and kind in ('expense','income') and day between $2 and $3
      group by 1 order by 1`,
    args,
  );

  const topExpenses = await q<any>(
    `select id, to_char(day,'YYYY-MM-DD') as day, title, content, amount, category
       from entries
      where user_id = $1 and deleted_at is null and kind = 'expense' and day between $2 and $3
      order by amount desc nulls last limit 10`,
    args,
  );

  const t = totals[0] ?? { expense: 0, income: 0, n: 0 };
  return {
    from,
    to,
    expense: Number(t.expense),
    income: Number(t.income),
    net: Number(t.income) - Number(t.expense),
    byCategory,
    byDay,
    byMonth,
    topExpenses,
  };
}

/** 常用分类（供前端下拉；按历史使用频次排序） */
export async function frequentCategories(userId: string, kind: 'expense' | 'income'): Promise<string[]> {
  const rows = await q<{ category: string; n: number }>(
    `select category, count(*)::int as n from entries
      where user_id = $1 and kind = $2 and category is not null and deleted_at is null
      group by category order by n desc limit 30`,
    [userId, kind],
  );
  const defaults =
    kind === 'expense'
      ? ['餐饮', '交通', '购物', '居住', '水电', '通讯', '娱乐', '医疗', '学习', '人情', '旅行']
      : ['工资', '奖金', '报销', '理财', '红包', '兼职', '退款'];
  const seen = new Set(rows.map((r) => r.category));
  return [...rows.map((r) => r.category), ...defaults.filter((d) => !seen.has(d))];
}
