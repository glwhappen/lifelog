/**
 * 集成测试的公共设施。
 *
 * 只在设置了 TEST_DATABASE_URL 时才跑集成测试（见 tests/integration/*.test.ts 的 skipIf），
 * 这样 `npm test` 在没有数据库的机器上也能全绿。
 * 想跑真库测试用 `npm run test:db`（会临时起一个 postgres 容器）。
 */
import { beforeAll, beforeEach } from 'vitest';
import { db, q } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';

export const TEST_DB = process.env.TEST_DATABASE_URL || '';
export const hasDb = Boolean(TEST_DB);

/** 集成测试统一用这个用户；每个用例前清空所有业务表 */
export const TEST_SUB = 'test-user';

export function testUser(over: Partial<SessionUser> = {}): SessionUser {
  return {
    sub: TEST_SUB,
    username: 'tester',
    name: '测试用户',
    timezone: 'Asia/Shanghai',
    isAdmin: true,
    ...over,
  };
}

/** 直接构造工具层的 ctx（绕过 HTTP 鉴权） */
export function ctx(over: Partial<SessionUser> = {}) {
  return { user: testUser(over), scopes: ['read', 'write', 'admin'] as const };
}

const TABLES = [
  'attachments',
  'habit_logs',
  'locations',
  'daily_summaries',
  'entries',
  'tasks',
  'api_keys',
  'habits',
];

export async function resetDb(): Promise<void> {
  // users 最后删，其它表都有外键指过来
  await q(`truncate ${TABLES.map((t) => `public.${t}`).join(', ')} restart identity cascade`);
  await q('delete from users');
  await q(
    `insert into users (sub, username, name, timezone, is_admin)
     values ($1, 'tester', '测试用户', 'Asia/Shanghai', true)`,
    [TEST_SUB],
  );
}

/** 在集成测试里统一挂上：连接检查 + 每个用例前清库 */
export function useTestDb(): void {
  beforeAll(async () => {
    await db().query('select 1');
  });
  beforeEach(async () => {
    await resetDb();
  });
}

/** 取某天的字符串（用于断言） */
export function daysAgo(n: number, tz = 'Asia/Shanghai'): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const base = new Date(`${fmt.format(d)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - n);
  return base.toISOString().slice(0, 10);
}
