import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { externalOrigin, oidcEndpoints } from '@/lib/oidc';
import { oidcStateCookie } from '@/lib/auth';

export const runtime = 'nodejs';

/** 发起登录：跳转到 IdP 的授权端点 */
export async function GET(req: Request) {
  const origin = externalOrigin(req);
  if (!env.oidcClientId) {
    return NextResponse.json(
      { ok: false, error: '未配置 OIDC_CLIENT_ID；本地调试可设 ALLOW_ANON=1 使用匿名单机模式' },
      { status: 500 },
    );
  }
  const ep = await oidcEndpoints();
  const state = crypto.randomUUID();
  const url = new URL(ep.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.oidcClientId);
  url.searchParams.set('redirect_uri', `${origin}/auth/callback`);
  url.searchParams.set('scope', process.env.OIDC_SCOPE || 'openid profile email');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(oidcStateCookie, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return res;
}
