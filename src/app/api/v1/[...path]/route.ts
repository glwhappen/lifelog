import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';
import { assertScope, resolveActor } from '@/lib/apikey';
import { toolByName, tools } from '@/lib/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 统一 REST 入口（与 MCP 共用同一套工具定义）：
 *   GET  /api/v1/tools              列出全部能力
 *   GET  /api/v1/<tool>?k=v         调用只读工具
 *   POST /api/v1/<tool>  {json}     调用任意工具
 * 鉴权：网页会话 Cookie，或 Authorization: Bearer ll-xxx
 */

function err(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[api/v1]', msg);
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path } = await params;
    const name = path?.[0] ?? '';

    if (name === 'tools' || name === '') {
      return NextResponse.json({
        ok: true,
        tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, scope: t.scope, inputSchema: t.inputSchema })),
      });
    }

    const tool = toolByName.get(name);
    if (!tool) return NextResponse.json({ ok: false, error: `未知工具：${name}` }, { status: 404 });
    if (tool.scope !== 'read') {
      return NextResponse.json({ ok: false, error: `${name} 是写操作，请用 POST` }, { status: 405 });
    }

    const actor = await resolveActor(req);
    assertScope(actor, 'read');
    const url = new URL(req.url);
    const args: Record<string, unknown> = {};
    for (const [k, v] of url.searchParams) {
      if (k === 'tags') args[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
      else if (k === 'limit' || k === 'days' || k === 'max_days') args[k] = Number(v);
      else args[k] = v;
    }
    const data = await tool.handler({ user: actor.user, scopes: actor.scopes }, args);

    // 导出类接口支持直接返回 Markdown 文本（方便浏览器下载 / 喂给笔记库）
    if (name === 'daily_digest' && url.searchParams.get('format') === 'markdown') {
      const md = (data as { markdown?: string })?.markdown ?? '';
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `inline; filename="lifelog-${new Date().toISOString().slice(0, 10)}.md"`,
        },
      });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return err(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path } = await params;
    const name = path?.[0] ?? '';
    const tool = toolByName.get(name);
    if (!tool) return NextResponse.json({ ok: false, error: `未知工具：${name}` }, { status: 404 });

    const actor = await resolveActor(req);
    assertScope(actor, 'read');
    assertScope(actor, tool.scope);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const data = await tool.handler({ user: actor.user, scopes: actor.scopes }, body ?? {});
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return err(e);
  }
}
