import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';
import { assertScope, resolveActor } from '@/lib/apikey';
import { rateLimit } from '@/lib/ratelimit';
import { aiCaptureInfo, interpretAndApply } from '@/lib/capture';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 速记框的 AI 解析入口。
 *
 *   POST /api/ai/capture  { text: "记录一下明天要给车做保养", day?: "2026-10-11" }
 *
 * 返回：模型的一句话回应 + 已执行的动作 + 需要确认的破坏性动作 + 撤销操作。
 * 模型不可用时自动降级为规则分流（usedAi=false），录入动作永远不会失败。
 */
export async function POST(req: Request) {
  try {
    const actor = await resolveActor(req);
    assertScope(actor, 'write');

    const rl = rateLimit(`ai:${actor.user.sub}`, env.aiRatePerMin);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: `AI 解析太频繁（上限 ${rl.limit}/分钟），请 ${rl.retryAfter} 秒后再试` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body: any = await req.json().catch(() => ({}));
    const text = String(body?.text ?? '').trim();
    if (!text) return NextResponse.json({ ok: false, error: '没有内容可解析' }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ ok: false, error: '内容太长（上限 2000 字）' }, { status: 400 });

    const day = typeof body?.day === 'string' && body.day ? String(body.day) : undefined;

    const outcome = await interpretAndApply({ user: actor.user, scopes: actor.scopes }, text, day);
    return NextResponse.json({ ok: true, data: outcome });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error('[ai/capture]', e);
    return NextResponse.json({ ok: false, error: '解析服务出错了' }, { status: 500 });
  }
}

/** 前端用来决定是否显示「AI 已就绪」的小徽标 */
export async function GET() {
  return NextResponse.json({ ok: true, data: aiCaptureInfo() });
}
