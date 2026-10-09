import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { ANON_SUB, env } from './env';
import { one, q } from './db';

const COOKIE = 'lifelog_session';
const OIDC_STATE_COOKIE = 'lifelog_oidc_state';

function secret(): Uint8Array {
  if (!env.sessionSecret) throw new Error('SESSION_SECRET 未配置');
  return new TextEncoder().encode(env.sessionSecret);
}

export interface SessionUser {
  sub: string;
  username: string;
  name?: string;
  avatar?: string;
  timezone: string;
  isAdmin?: boolean;
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(COOKIE)?.value;
  } catch {
    // 不在 Next 的请求上下文里（脚本 / 测试 / 后台任务）：当作没有会话。
    // 这样纯 API Key 调用方永远不会因为「拿不到 cookie」而 500。
    token = undefined;
  }
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      const sub = String(payload.sub ?? '');
      if (sub) {
        const row = await one<{ timezone: string; is_admin: boolean; username: string; name: string | null; avatar_url: string | null }>(
          'select timezone, is_admin, username, name, avatar_url from users where sub = $1',
          [sub],
        );
        return {
          sub,
          username: row?.username ?? String((payload as any).username ?? 'user'),
          name: row?.name ?? (payload as any).name,
          avatar: row?.avatar_url ?? (payload as any).avatar,
          timezone: row?.timezone ?? env.defaultTimezone,
          isAdmin: row?.is_admin ?? false,
        };
      }
    } catch {
      /* 过期或篡改：按未登录处理 */
    }
  }
  if (env.allowAnon) {
    const u = await upsertUser({ sub: ANON_SUB, username: 'anon', timezone: env.defaultTimezone });
    return u;
  }
  return null;
}

/**
 * 把 SSO 用户镜像进 users 表（其余表都有外键）。
 * 首个登录用户按配置自动成为管理员——开源自托管场景下这最省事。
 */
export async function upsertUser(u: {
  sub: string;
  username: string;
  name?: string;
  email?: string;
  avatar?: string;
  timezone?: string;
}): Promise<SessionUser> {
  const admins = await one<{ n: number }>('select count(*)::int as n from users where is_admin = true');
  const shouldPromote = env.firstUserIsAdmin && (admins?.n ?? 0) === 0;
  const row = await one<{ timezone: string; is_admin: boolean; username: string; name: string | null; avatar_url: string | null }>(
    `insert into users (sub, username, name, email, avatar_url, timezone, is_admin)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (sub) do update set
       username = excluded.username,
       name = coalesce(excluded.name, users.name),
       email = coalesce(excluded.email, users.email),
       avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
       last_login_at = now(),
       is_admin = users.is_admin or excluded.is_admin
     returning timezone, is_admin, username, name, avatar_url`,
    [
      u.sub,
      u.username,
      u.name ?? null,
      u.email ?? null,
      u.avatar ?? null,
      u.timezone ?? env.defaultTimezone,
      shouldPromote,
    ],
  );
  return {
    sub: u.sub,
    username: row?.username ?? u.username,
    name: row?.name ?? u.name,
    avatar: row?.avatar_url ?? u.avatar,
    timezone: row?.timezone ?? env.defaultTimezone,
    isAdmin: row?.is_admin ?? false,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AuthError('未登录');
  return u;
}

export async function updateTimezone(sub: string, timezone: string): Promise<void> {
  await q('update users set timezone = $2 where sub = $1', [sub, timezone]);
}

export class AuthError extends Error {
  readonly status = 401;
}

export const oidcStateCookie = OIDC_STATE_COOKIE;
