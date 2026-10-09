/**
 * 极简内存限流（固定窗口计数）。
 *
 * 为什么需要：这个服务会把「写」能力交给大模型。一个跑飞了的 agent 循环
 * 或在死循环里反复调用工具，能在几秒内往库里灌几千条记录。
 * 限流是最后一道闸门。
 *
 * 局限：进程内存，多实例部署时每个实例各算各的。
 * 本项目是单容器自托管，够用；要做集群限流请换成 Redis。
 */

interface Bucket {
  n: number;
  reset: number;
}

/** 清理间隔：长跑进程必须定期回收，否则 key 会随时间无限堆积 */
function pruneInterval(): number {
  const n = Number(process.env.RATE_LIMIT_PRUNE_INTERVAL_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

/** 供监控/测试观察当前占用（内存是否无界增长） */
export function rateLimitBucketCount(): number {
  return buckets.size;
}

const buckets = new Map<string, Bucket>();
let lastPrune = 0;

/** 清理过期桶。正常情况下每 60 秒最多扫一次，避免高频调用白扫。 */
function prune(now: number): void {
  if (now - lastPrune < pruneInterval()) return;
  lastPrune = now;
  for (const [k, b] of buckets) {
    if (b.reset <= now) buckets.delete(k);
  }
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  /** 距离窗口重置还有多少秒（超限时给客户端看的） */
  retryAfter: number;
  limit: number;
}

export function rateLimit(key: string, limit: number, windowMs = 60_000): RateResult {
  const now = Date.now();
  prune(now);

  // limit <= 0 视为不限流（本地调试/测试用）
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0, limit };
  }

  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.n += 1;

  const retryAfter = Math.max(1, Math.ceil((b.reset - now) / 1000));
  return {
    ok: b.n <= limit,
    remaining: Math.max(0, limit - b.n),
    retryAfter,
    limit,
  };
}

/** 测试用：清空所有计数 */
export function resetRateLimits(): void {
  buckets.clear();
  lastPrune = 0;
}

/** 读限额（每分钟），从环境变量实时读，便于测试覆盖 */
export function readLimit(): number {
  return Number(process.env.RATE_LIMIT_READ_PER_MIN ?? 600);
}

/** 写限额（每分钟） */
export function writeLimit(): number {
  return Number(process.env.RATE_LIMIT_WRITE_PER_MIN ?? 120);
}
