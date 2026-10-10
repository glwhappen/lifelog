import { env } from './env';

/**
 * 极简的 OpenAI 兼容「函数调用」客户端。
 *
 * 不引 SDK：只需要 /chat/completions 一个端点 + 工具调用循环，
 * 手写 100 行比拖一个依赖更好维护，也不会被 SDK 的版本变化牵连。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function aiEnabled(): boolean {
  return Boolean(env.deepseekKey) && env.aiCaptureEnabled;
}

interface CompletionResponse {
  choices?: Array<{ message?: ChatMessage; finish_reason?: string }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    /** DeepSeek 的上下文缓存命中量：命中部分计费便宜一个数量级，值得监控 */
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
  error?: { message?: string };
}

export interface AiUsage {
  total: number;
  prompt: number;
  completion: number;
  cacheHit: number;
}

async function chatCompletion(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ message: ChatMessage; usage: AiUsage }> {
  const url = `${env.deepseekBase.replace(/\/$/, '')}/chat/completions`;
  const timeout = AbortSignal.timeout(env.aiTimeoutMs);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.deepseekKey}`,
      },
      body: JSON.stringify(body),
      signal: merged,
    });
  } catch (e) {
    throw new AiError(`调用模型失败：${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await res.text();
  let data: CompletionResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiError(`模型返回了非 JSON 内容（HTTP ${res.status}）`, res.status);
  }

  if (!res.ok) {
    throw new AiError(data?.error?.message || `模型返回 HTTP ${res.status}`, res.status);
  }

  const message = data.choices?.[0]?.message;
  if (!message) throw new AiError('模型没有返回任何内容');
  const u = data.usage ?? {};
  return {
    message,
    usage: {
      total: u.total_tokens ?? 0,
      prompt: u.prompt_tokens ?? 0,
      completion: u.completion_tokens ?? 0,
      cacheHit: u.prompt_cache_hit_tokens ?? 0,
    },
  };
}

export interface ChatWithToolsResult {
  reply: string;
  rounds: number;
  usage: AiUsage;
}

/**
 * 跑一轮「模型 → 调工具 → 把结果喂回去 → 再决定」的循环。
 *
 * onToolCall 由调用方提供：它决定工具到底是真执行、还是只登记待确认。
 * 之所以不在这里直接执行，是因为「哪些工具需要用户确认」属于产品策略，
 * 不该塞进一个通用的模型客户端里。
 *
 * 轮数上限是必须的：模型偶尔会陷入反复调同一个工具，没有上限就会一直烧钱。
 */
export async function chatWithTools(opts: {
  messages: ChatMessage[];
  tools: ToolSchema[];
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxRounds?: number;
  signal?: AbortSignal;
  /**
   * 这一轮的工具调用「是否已经完成任务」。
   * 返回 true 就直接收尾，不再多问模型一轮 —— 每次多问一轮都要把
   * 全部工具 schema 重发一遍，是这类应用最大的单项开销。
   */
  shouldStopAfterRound?: (names: string[]) => boolean;
}): Promise<ChatWithToolsResult> {
  const maxRounds = opts.maxRounds ?? 4;
  const messages: ChatMessage[] = [...opts.messages];
  const usage: AiUsage = { total: 0, prompt: 0, completion: 0, cacheHit: 0 };
  let rounds = 0;

  for (let i = 0; i < maxRounds; i++) {
    rounds = i + 1;
    const { message, usage: u } = await chatCompletion(
      {
        model: env.deepseekModel,
        messages,
        tools: opts.tools.map((s) => ({ type: 'function', function: s })),
        tool_choice: 'auto',
        temperature: 0,
        // 必须关思考！实测（deepseek-flash，同一句话）：
        //   开：reasoning 331 字符、completion 200 tokens（被截断）、耗时 3.8s、content 为空
        //   关：reasoning 0、completion 13 tokens、耗时 2.5s
        // 「content 为空」是最阴的：思考占满预算，模型实际什么都没答，功能看起来像没生效。
        thinking: { type: 'disabled' },
      },
      opts.signal,
    );
    usage.total += u.total;
    usage.prompt += u.prompt;
    usage.completion += u.completion;
    usage.cacheHit += u.cacheHit;
    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      return { reply: (message.content ?? '').trim(), rounds, usage };
    }

    const called: string[] = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // 模型给了坏 JSON：把错误当工具结果喂回去，让它自己纠正，而不是整轮失败
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: '参数不是合法 JSON，请重新给出。',
        });
        continue;
      }
      let result: string;
      try {
        result = await opts.onToolCall(call.function.name, args);
      } catch (e) {
        result = `执行失败：${e instanceof Error ? e.message : String(e)}`;
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      called.push(call.function.name);
    }

    // 已经把事情做完（例如全都是一次性的写操作）就不再追问一轮，省掉一次全量重发
    if (called.length && opts.shouldStopAfterRound?.(called)) {
      return { reply: (message.content ?? '').trim(), rounds, usage };
    }
  }

  // 轮数用尽：不再追问，返回最后一轮的文字（通常是空的）
  const last = messages[messages.length - 1];
  return { reply: (last?.content ?? '').trim(), rounds, usage };
}

/** 把运行时校验过的参数转成给模型的紧凑文本（避免把大对象原样回灌） */
export function compactToolResult(data: unknown, limit = 1200): string {
  const s = typeof data === 'string' ? data : JSON.stringify(data ?? {});
  return s.length > limit ? `${s.slice(0, limit)}…（已截断）` : s;
}
