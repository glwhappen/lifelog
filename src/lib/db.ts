import { Pool, types } from 'pg';
import { env } from './env';

// bigint(int8) 默认返回字符串，这里转 number（本项目 id 量级安全）
types.setTypeParser(20, (v) => Number(v));
// numeric 默认返回字符串，业务上要参与计算，转 number
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date 保持 'YYYY-MM-DD' 字符串：转成 JS Date 会被序列化成 ISO 串，前端和 AI 都难用
types.setTypeParser(1082, (v) => v);

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    if (!env.databaseUrl) throw new Error('DATABASE_URL 未配置');
    pool = new Pool({ connectionString: env.databaseUrl, max: 8 });
  }
  return pool;
}

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db().query(sql, params as any[]);
  return res.rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/** 在事务里执行一组操作（写入入口需要保证一致性） */
export async function tx<T>(fn: (c: { q: typeof q; one: typeof one }) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const c = {
      q: async <R = any>(sql: string, params: unknown[] = []) =>
        (await client.query(sql, params as any[])).rows as R[],
      one: async <R = any>(sql: string, params: unknown[] = []) =>
        ((await client.query(sql, params as any[])).rows[0] ?? null) as R | null,
    };
    const out = await fn(c);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
