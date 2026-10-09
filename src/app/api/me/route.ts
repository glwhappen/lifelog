import { NextResponse } from 'next/server';
import { AuthError, requireUser, updateTimezone } from '@/lib/auth';
import { ensureDefaultHabits } from '@/lib/habits';
import { taskCounts } from '@/lib/tasks';
import { loggingStreak } from '@/lib/day';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const u = await requireUser();
    await ensureDefaultHabits(u.sub);
    const [counts, streak] = await Promise.all([taskCounts(u.sub, u.timezone), loggingStreak(u.sub, u.timezone)]);
    return NextResponse.json({ ok: true, user: u, counts, streak });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const u = await requireUser();
    const body: any = await req.json().catch(() => ({}));
    if (typeof body.timezone === 'string' && body.timezone.length < 64) {
      await updateTimezone(u.sub, body.timezone);
      return NextResponse.json({ ok: true, timezone: body.timezone });
    }
    return NextResponse.json({ ok: false, error: '缺少 timezone' }, { status: 400 });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status });
  }
}
