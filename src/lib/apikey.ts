import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_KEY_PREFIX, env } from './env';
import { currentUser, AuthError, type SessionUser } from './auth';
import { one, q } from './db';

export type Scope = 'read' | 'write' | 'admin';

export interface ApiKeyRow {
  id: number;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** 生成新 key：只返回一次明文，库里只留 sha256。 */
export async function createApiKey(
  userId: string,
  name: string,
  scopes: Scope[],
): Promise<{ key: string; row: ApiKeyRow }> {
  const raw = API_KEY_PREFIX + randomBytes(24).toString('base64url');
  const row = await one<ApiKeyRow>(
    `insert into api_keys (user_id, name, prefix, key_sha256, scopes)
     values ($1, $2, $3, $4, $5)
     returning id, user_id, name, prefix, scopes, last_used_at, created_at, revoked_at`,
    [userId, name || 'default', raw.slice(0, API_KEY_PREFIX.length + 6), sha256(raw), scopes],
  );
  return { key: raw, row: row! };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  return q<ApiKeyRow>(
    `select id, user_id, name, prefix, scopes, last_used_at, created_at, revoked_at
       from api_keys where user_id = $1 order by created_at desc`,
    [userId],
  );
}

export async function revokeApiKey(userId: string, id: number): Promise<boolean> {
  const rows = await q(
    'update api_keys set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning id',
    [id, userId],
  );
  return rows.length > 0;
}

/** 校验 Bearer key，返回归属用户与 scope；失败返回 null。 */
export async function verifyApiKey(raw: string): Promise<{ user: SessionUser; scopes: Scope[] } | null> {
  const hash = sha256(raw.trim());
  const row = await one<{ user_id: string; scopes: string[]; key_sha256: string }>(
    `select user_id, scopes, key_sha256 from api_keys
      where key_sha256 = $1 and revoked_at is null`,
    [hash],
  );
  if (!row) return null;
  // 双保险：命中行后再做一次常量时间比较
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(row.key_sha256, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  q('update api_keys set last_used_at = now() where key_sha256 = $1', [hash]).catch(() => {});

  const u = await one<{ sub: string; username: string; name: string | null; avatar_url: string | null; timezone: string; is_admin: boolean }>(
    'select sub, username, name, avatar_url, timezone, is_admin from users where sub = $1',
    [row.user_id],
  );
  if (!u) return null;
  return {
    user: {
      sub: u.sub,
      username: u.username,
      name: u.name ?? undefined,
      avatar: u.avatar_url ?? undefined,
      timezone: u.timezone,
      isAdmin: u.is_admin,
    },
    scopes: row.scopes as Scope[],
  };
}

export interface Actor {
  user: SessionUser;
  scopes: Scope[];
  via: 'session' | 'apikey' | 'anon';
}

/** 统一「谁在调用」：优先 Bearer API Key，其次登录 Cookie。 */
export async function resolveActor(req: Request): Promise<Actor> {
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const v = await verifyApiKey(m[1]);
    if (!v) throw new AuthError('API Key 无效或已吊销');
    return { user: v.user, scopes: v.scopes, via: 'apikey' };
  }
  const u = await currentUser();
  if (!u) throw new AuthError('未登录');
  // 网页会话视为全权限
  return { user: u, scopes: ['read', 'write', 'admin'], via: env.allowAnon && u.sub === 'anonymous' ? 'anon' : 'session' };
}

export function assertScope(actor: Actor, scope: Scope): void {
  if (!actor.scopes.includes(scope)) {
    throw new AuthError(`当前密钥缺少 ${scope} 权限`);
  }
}
