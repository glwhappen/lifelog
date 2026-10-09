import { NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth';
import { createApiKey, listApiKeys, revokeApiKey, type Scope } from '@/lib/apikey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: Scope[] = ['read', 'write', 'admin'];

/** 列出当前用户的 API Key（只有前缀，明文不可再取回） */
export async function GET() {
  try {
    const u = await requireUser();
    const rows = await listApiKeys(u.sub);
    return NextResponse.json({ ok: true, keys: rows });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status });
  }
}

/** 签发新 Key；明文只在这一次返回 */
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const body: any = await req.json().catch(() => ({}));
    const name = String(body.name ?? '').trim().slice(0, 60) || 'default';
    const scopes: Scope[] = Array.isArray(body.scopes)
      ? body.scopes.filter((s: string) => VALID.includes(s as Scope))
      : ['read', 'write'];
    const { key, row } = await createApiKey(u.sub, name, scopes.length ? scopes : ['read']);
    return NextResponse.json({ ok: true, key, row });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status });
  }
}

/** 吊销 */
export async function DELETE(req: Request) {
  try {
    const u = await requireUser();
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ ok: false, error: '缺少 id' }, { status: 400 });
    const ok = await revokeApiKey(u.sub, id);
    return NextResponse.json({ ok });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status });
  }
}
