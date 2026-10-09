import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { externalOrigin, oidcEndpoints } from '@/lib/oidc';
import { createSession, oidcStateCookie, upsertUser } from '@/lib/auth';

export const runtime = 'nodejs';

/** OIDC 回调：换 token → 取身份 → 落库 → 建会话 */
export async function GET(req: Request) {
  const origin = externalOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const jar = await cookies();
  const expect = jar.get(oidcStateCookie)?.value;

  if (!code || !state || !expect || state !== expect) {
    return NextResponse.json({ ok: false, error: 'state 校验失败，请重新登录' }, { status: 400 });
  }

  const ep = await oidcEndpoints();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env.oidcClientId,
    client_secret: env.oidcClientSecret,
    redirect_uri: `${origin}/auth/callback`,
  });
  const tokenRes = await fetch(ep.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text().catch(() => '');
    console.error('[auth] token 交换失败', tokenRes.status, t.slice(0, 300));
    return NextResponse.json({ ok: false, error: `token 交换失败 ${tokenRes.status}` }, { status: 502 });
  }
  const token: any = await tokenRes.json();

  // id_token 是权威身份声明；userinfo 用来补头像等
  let claims: any = {};
  try {
    const payload = String(token.id_token ?? '').split('.')[1];
    if (payload) claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    console.error('[auth] id_token 解析失败', String(e));
  }

  let info: any = {};
  try {
    const r = await fetch(ep.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) info = await r.json();
  } catch (e) {
    console.error('[auth] userinfo 获取失败（不致命）', String(e));
  }

  const merged = { ...info, ...claims };
  const sub = String(merged.sub ?? '');
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'IdP 未返回 sub' }, { status: 502 });
  }

  // 头像最长 512 字符：某些 IdP 会返回超长的 data URI，直接截断丢弃
  let avatar = merged.picture ? String(merged.picture) : undefined;
  if (avatar && (avatar.startsWith('data:') || avatar.length > 512)) avatar = undefined;

  const user = await upsertUser({
    sub,
    username: String(merged.preferred_username ?? merged.nickname ?? merged.name ?? 'user'),
    name: merged.name ? String(merged.name) : undefined,
    email: merged.email ? String(merged.email) : undefined,
    avatar,
  });
  await createSession(user);

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.delete(oidcStateCookie);
  return res;
}
