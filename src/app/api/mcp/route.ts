import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AuthError } from '@/lib/auth';
import { assertScope, resolveActor, type Actor } from '@/lib/apikey';
import { rateLimit, readLimit, writeLimit } from '@/lib/ratelimit';
import { toolByName, toolCatalog, tools } from '@/lib/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MCP 服务端（Streamable HTTP，无状态）。
 *
 * 客户端配置只需两样东西：
 *   URL:   https://<你的域名>/api/mcp
 *   Header: Authorization: Bearer ll-xxxxx
 *
 * 每次 POST 都新建 server + transport，不保留会话——个人自托管场景下最省心，
 * 也避免了容器重启后 session 失效的问题。
 */

const SERVER_INSTRUCTIONS = `LifeLog 是这位用户的生活记录库：待办、完成、灵感、笔记、习惯打卡、收支、位置、健康指标。

用法要点：
1. 回答「我今天/这周怎么样」先调 get_day 或 stats_overview，不要凭空猜。
2. 记录优先用语义明确的工具（add_task / log_expense / check_habit / log_metric）；
   只有用户丢来一句没有上下文的话，才用 quick_capture 让它自动分流。
3. 时间参数可以是 YYYY-MM-DD，也可以是 今天/昨天/前天/明天。
4. 涉及金额时先看 finance_summary 的分类习惯，保持分类名一致。
5. 写完记得用简短一句话回报做了什么，不要复述全部数据。

可用工具：
${toolCatalog()}`;

function buildServer(actor: Actor): Server {
  const server = new Server(
    { name: 'lifelog', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as any,
      annotations: {
        title: t.title,
        readOnlyHint: t.scope === 'read',
        destructiveHint: false,
        openWorldHint: false,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const ok = (data: unknown) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    });
    const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });

    const tool = toolByName.get(name);
    if (!tool) return fail(`未知工具 ${name}；可用工具见 tools/list`);

    try {
      assertScope(actor, 'read');
      assertScope(actor, tool.scope);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }

    // 写工具单独限流：跑飞的 agent 最容易死循环调写接口
    if (tool.scope === 'write') {
      const rl = rateLimit(`write:${actor.user.sub}`, writeLimit());
      if (!rl.ok) return fail(`请求过于频繁（写操作上限 ${rl.limit}/分钟），请 ${rl.retryAfter} 秒后再试`);
    }

    try {
      const data = await tool.handler({ user: actor.user, scopes: actor.scopes }, args);
      return ok(data ?? { ok: true });
    } catch (e) {
      console.error(`[mcp] ${name} 失败`, e);
      return fail(`执行失败：${e instanceof Error ? e.message : String(e)}`);
    }
  });

  return server;
}

async function handle(req: Request): Promise<Response> {
  let actor: Actor;
  try {
    actor = await resolveActor(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: '未授权：请在 Authorization 头带上 Bearer ll-xxx 的 API Key' },
        id: null,
      },
      { status },
    );
  }

  // 请求级限流（写工具还有一道更严的，在 CallTool 里）
  const rl = rateLimit(`read:${actor.user.sub}`, readLimit());
  if (!rl.ok) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32029, message: `请求过于频繁，请 ${rl.retryAfter} 秒后再试` }, id: null },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const server = buildServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // 无状态
    enableJsonResponse: true,
  });

  await server.connect(transport);
  const res = await transport.handleRequest(req);
  return res;
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    },
  });
}
