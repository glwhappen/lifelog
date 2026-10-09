import { NextResponse } from 'next/server';
import { one } from '@/lib/db';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 健康检查：进程活着 + 数据库真的连得上（避免「容器在跑但数据库是空的」这类假健康） */
export async function GET() {
  const started = Date.now();
  try {
    await one('select 1 as ok');
    return NextResponse.json({
      ok: true,
      db: 'up',
      latencyMs: Date.now() - started,
      oidc: env.oidcClientId ? 'configured' : 'missing',
      time: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: 'down', error: e instanceof Error ? e.message : 'db error' },
      { status: 503 },
    );
  }
}
