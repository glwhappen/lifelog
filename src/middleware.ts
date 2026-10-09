import { NextResponse, type NextRequest } from 'next/server';

/**
 * CSRF 防护：对「带 Cookie 的写请求」校验 Origin。
 *
 * 为什么要加：写操作（/api/v1/* POST、/api/keys DELETE…）接受会话 Cookie 鉴权。
 * 虽然 Cookie 设了 SameSite=Lax（跨站 POST 本来就不带 Cookie），但那是最后一道兜底，
 * 一旦哪天 Cookie 策略被改动，攻击面就直接打开了。这里做显式校验。
 *
 * 用 Bearer API Key 的调用方天然不受 CSRF 影响（浏览器不会自动附带），直接放行。
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function middleware(req: NextRequest) {
  if (!MUTATING.has(req.method)) return NextResponse.next();
  if (req.headers.get('authorization')) return NextResponse.next();

  const origin = req.headers.get('origin');
  // 没有 Origin 的请求（curl、服务端调用、同源表单）放行：
  // 浏览器发起的跨站请求一定会带 Origin。
  if (!origin) return NextResponse.next();

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  let sameSite = false;
  try {
    sameSite = new URL(origin).host === host;
  } catch {
    sameSite = false;
  }

  if (!sameSite) {
    return NextResponse.json({ ok: false, error: '跨站请求被拒绝' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
