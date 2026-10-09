import { one, q } from './db';
import { atTimeOfDay, normDay, resolveRange, todayIn } from './dates';
import type { Entry } from './types';

export interface EntryInput {
  kind: string;
  day?: string;
  at?: string; // HH:mm
  title?: string;
  content?: string;
  amount?: number | null;
  currency?: string;
  category?: string | null;
  tags?: string[];
  source?: string;
  meta?: Record<string, any>;
  happenedAt?: string;
}

const COLS = `id, user_id, kind, day, happened_at, title, content, amount, currency,
  category, tags, source, meta, task_id, created_at, updated_at, deleted_at`;

/**
 * 全文搜索用的表达式。
 * ⚠️ 必须与 migrations/002_fix_search_index.sql 里的 GIN 索引表达式**字面完全一致**，
 * 否则索引不会被使用（只能全表扫描）。改这里就要加一个新迁移重建索引。
 */
export const SEARCH_EXPR = `(coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(category, ''))`;

export async function createEntry(userId: string, tz: string, input: EntryInput): Promise<Entry> {
  const day = input.day ? normDay(input.day, tz) : todayIn(tz);
  const happenedAt = input.happenedAt ?? (input.at ? atTimeOfDay(day, input.at, tz) : undefined);
  const row = await one<Entry>(
    `insert into entries (user_id, kind, day, happened_at, title, content, amount, currency, category, tags, source, meta)
     values ($1,$2,$3, coalesce($4::timestamptz, now()), $5,$6,$7,$8,$9,$10,$11,$12)
     returning ${COLS}`,
    [
      userId,
      input.kind,
      day,
      happenedAt ?? null,
      input.title ?? null,
      input.content ?? null,
      input.amount ?? null,
      input.currency ?? 'CNY',
      input.category ?? null,
      input.tags ?? [],
      input.source ?? 'web',
      JSON.stringify(input.meta ?? {}),
    ],
  );
  return row!;
}

export interface EntryQuery {
  kind?: string | string[];
  from?: unknown;
  to?: unknown;
  days?: unknown;
  range?: unknown;
  q?: string;
  tags?: string[];
  category?: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export async function queryEntries(userId: string, tz: string, query: EntryQuery): Promise<Entry[]> {
  const { from, to } = resolveRange(query, tz);
  const where: string[] = ['user_id = $1', 'deleted_at is null', 'day between $2 and $3'];
  const args: unknown[] = [userId, from, to];

  if (query.kind) {
    const kinds = Array.isArray(query.kind) ? query.kind : [query.kind];
    if (kinds.length) {
      args.push(kinds);
      where.push(`kind = any($${args.length})`);
    }
  }
  if (query.category) {
    args.push(query.category);
    where.push(`category = $${args.length}`);
  }
  if (query.tags?.length) {
    args.push(query.tags);
    where.push(`tags && $${args.length}`);
  }
  if (query.q) {
    args.push(`%${query.q}%`);
    where.push(`${SEARCH_EXPR} ilike $${args.length}`);
  }

  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 1000);
  const offset = Math.max(Number(query.offset) || 0, 0);
  args.push(limit, offset);
  const order = query.order === 'asc' ? 'asc' : 'desc';

  return q<Entry>(
    `select ${COLS} from entries
      where ${where.join(' and ')}
      order by day ${order}, happened_at ${order}, id ${order}
      limit $${args.length - 1} offset $${args.length}`,
    args,
  );
}

export async function getEntry(userId: string, id: number): Promise<Entry | null> {
  return one<Entry>(`select ${COLS} from entries where id = $1 and user_id = $2 and deleted_at is null`, [id, userId]);
}

export async function updateEntry(
  userId: string,
  id: number,
  patch: Partial<EntryInput> & { day?: string },
): Promise<Entry | null> {
  const sets: string[] = [];
  const args: unknown[] = [id, userId];
  const push = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.title !== undefined) push('title', patch.title);
  if (patch.content !== undefined) push('content', patch.content);
  if (patch.amount !== undefined) push('amount', patch.amount);
  if (patch.category !== undefined) push('category', patch.category);
  if (patch.tags !== undefined) push('tags', patch.tags);
  if (patch.kind !== undefined) push('kind', patch.kind);
  if (patch.day !== undefined) push('day', patch.day);
  if (patch.meta !== undefined) push('meta', JSON.stringify(patch.meta));
  if (!sets.length) return getEntry(userId, id);
  sets.push('updated_at = now()');
  return one<Entry>(
    `update entries set ${sets.join(', ')} where id = $1 and user_id = $2 and deleted_at is null returning ${COLS}`,
    args,
  );
}

export async function deleteEntry(userId: string, id: number): Promise<boolean> {
  const rows = await q(
    'update entries set deleted_at = now() where id = $1 and user_id = $2 and deleted_at is null returning id',
    [id, userId],
  );
  return rows.length > 0;
}

/** 数值型指标（体重/睡眠/饮水/心情…）：统一写进 entries，值放 amount，单位放 category。 */
export async function logMetric(
  userId: string,
  tz: string,
  input: { kind: string; value: number; unit?: string; day?: string; note?: string; source?: string; at?: string },
): Promise<Entry> {
  return createEntry(userId, tz, {
    kind: input.kind,
    day: input.day,
    at: input.at,
    amount: input.value,
    category: input.unit ?? null,
    content: input.note,
    source: input.source,
    meta: { unit: input.unit ?? null },
  });
}

/** 批量插入（GPX / 导入用），走多值 insert 减少往返。 */
export async function bulkCreateEntries(userId: string, rows: EntryInput[], source = 'import'): Promise<number> {
  if (!rows.length) return 0;
  const values: string[] = [];
  const args: unknown[] = [userId];
  for (const r of rows) {
    const base = args.length;
    args.push(r.kind, r.day, r.happenedAt ?? new Date().toISOString(), r.title ?? null, r.content ?? null,
      r.amount ?? null, r.category ?? null, r.tags ?? [], source, JSON.stringify(r.meta ?? {}));
    values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`);
  }
  const res = await q(
    `insert into entries (user_id, kind, day, happened_at, title, content, amount, category, tags, source, meta)
     values ${values.join(', ')} returning id`,
    args,
  );
  return res.length;
}
