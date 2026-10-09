import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';
import { assertScope, resolveActor } from '@/lib/apikey';
import { rateLimit, readLimit } from '@/lib/ratelimit';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 全量数据导出（数据主权）。
 *
 * 自托管产品的底线是：你的数据必须能整包带走。
 * 导出格式刻意保持「表结构原样」，不做美化，也不含 api_keys（只有哈希，没有意义）。
 *
 *   GET /api/export            全部历史
 *   GET /api/export?days=365   最近一年
 */
export async function GET(req: Request) {
  try {
    const actor = await resolveActor(req);
    assertScope(actor, 'read');
    const rl = rateLimit(`read:${actor.user.sub}`, readLimit());
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: '请求过于频繁' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
    }

    const user = actor.user.sub;
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || 0);
    const since = days > 0 ? new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) : null;

    const dayFilter = since ? 'and day >= $2' : '';
    const args = since ? [user, since] : [user];

    const [entries, tasks, habits, habitLogs, locations, summaries, counts] = await Promise.all([
      q(`select * from entries where user_id = $1 ${dayFilter} order by day, happened_at`, args),
      q(`select * from tasks where user_id = $1 ${since ? 'and (planned_day is null or planned_day >= $2)' : ''} order by planned_day nulls last, id`, args),
      q(`select * from habits where user_id = $1 order by sort, id`, [user]),
      q(`select * from habit_logs where user_id = $1 ${dayFilter} order by day`, args),
      q(`select * from locations where user_id = $1 ${dayFilter} order by happened_at`, args),
      q(`select * from daily_summaries where user_id = $1 ${dayFilter} order by day`, args),
      q<{ entries: number; tasks: number; habits: number; habit_logs: number; locations: number; daily_summaries: number }>(
        `select
           (select count(*)::int from entries where user_id = $1) as entries,
           (select count(*)::int from tasks where user_id = $1) as tasks,
           (select count(*)::int from habits where user_id = $1) as habits,
           (select count(*)::int from habit_logs where user_id = $1) as habit_logs,
           (select count(*)::int from locations where user_id = $1) as locations,
           (select count(*)::int from daily_summaries where user_id = $1) as daily_summaries`,
        [user],
      ),
    ]);

    const payload = {
      format: 'lifelog-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { sub: actor.user.sub, name: actor.user.name, username: actor.user.username, timezone: actor.user.timezone },
      range: since ? { from: since } : { from: null },
      totals: counts[0],
      tables: {
        entries,
        tasks,
        habits,
        habit_logs: habitLogs,
        locations,
        daily_summaries: summaries,
      },
    };

    const filename = `lifelog-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error('[export]', e);
    return NextResponse.json({ ok: false, error: '导出失败' }, { status: 500 });
  }
}
