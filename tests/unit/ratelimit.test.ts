import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, rateLimitBucketCount, resetRateLimits, readLimit, writeLimit } from '@/lib/ratelimit';

describe('rateLimit —— 内存固定窗口限流', () => {
  beforeEach(() => resetRateLimits());

  it('窗口内累计到上限后开始拒绝', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('u1', 3).ok).toBe(true);
    }
    const blocked = rateLimit('u1', 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('不同 key 互不影响（一个用户跑飞不会影响别人）', () => {
    rateLimit('a', 1);
    expect(rateLimit('a', 1).ok).toBe(false);
    expect(rateLimit('b', 1).ok).toBe(true);
  });

  it('窗口过期后自动恢复', async () => {
    expect(rateLimit('u2', 1, 40).ok).toBe(true);
    expect(rateLimit('u2', 1, 40).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit('u2', 1, 40).ok).toBe(true);
  });

  it('limit <= 0 或非数字表示不限流（测试/调试用）', () => {
    for (let i = 0; i < 50; i++) {
      expect(rateLimit('u3', 0).ok).toBe(true);
      expect(rateLimit('u4', -1).ok).toBe(true);
      expect(rateLimit('u5', NaN).ok).toBe(true);
    }
  });

  it('remaining 递减，便于回给客户端', () => {
    expect(rateLimit('u6', 5).remaining).toBe(4);
    expect(rateLimit('u6', 5).remaining).toBe(3);
  });

  it('retryAfter 是正整数秒', () => {
    rateLimit('u7', 1);
    const r = rateLimit('u7', 1);
    expect(Number.isInteger(r.retryAfter)).toBe(true);
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('大量 key 都记在内存里（先把计数验证清楚）', () => {
    process.env.RATE_LIMIT_PRUNE_INTERVAL_MS = '0';
    // 用长窗口，保证循环期间不会有过期的被清掉（否则这个断言会随机器快慢时好时坏）
    for (let i = 0; i < 300; i++) rateLimit(`burst${i}`, 1, 60_000);
    expect(rateLimitBucketCount()).toBe(300);
    delete process.env.RATE_LIMIT_PRUNE_INTERVAL_MS;
  });

  it('过期桶会被回收，内存不随时间无界增长（长跑进程的关键）', async () => {
    process.env.RATE_LIMIT_PRUNE_INTERVAL_MS = '0'; // 让每次调用都触发一次清理
    for (let i = 0; i < 50; i++) rateLimit(`short${i}`, 1, 20);
    expect(rateLimitBucketCount()).toBe(50);

    await new Promise((r) => setTimeout(r, 40)); // 等窗口全部过期

    rateLimit('trigger', 1, 20); // 触发清理
    expect(rateLimitBucketCount()).toBe(1); // 只剩刚创建的这一个
    delete process.env.RATE_LIMIT_PRUNE_INTERVAL_MS;
  });

  it('未过期的桶不会被误清（否则限流会失效）', () => {
    process.env.RATE_LIMIT_PRUNE_INTERVAL_MS = '0';
    rateLimit('keep', 1, 60_000);
    rateLimit('trigger2', 1, 60_000);
    expect(rateLimitBucketCount()).toBe(2);
    expect(rateLimit('keep', 1, 60_000).ok).toBe(false);
    delete process.env.RATE_LIMIT_PRUNE_INTERVAL_MS;
  });
});

describe('限流阈值读取', () => {
  it('默认值合理（读比写宽松）', () => {
    delete process.env.RATE_LIMIT_READ_PER_MIN;
    delete process.env.RATE_LIMIT_WRITE_PER_MIN;
    expect(readLimit()).toBeGreaterThan(writeLimit());
    expect(writeLimit()).toBeGreaterThan(0);
  });

  it('可以用环境变量覆盖', () => {
    process.env.RATE_LIMIT_READ_PER_MIN = '1000';
    process.env.RATE_LIMIT_WRITE_PER_MIN = '7';
    expect(readLimit()).toBe(1000);
    expect(writeLimit()).toBe(7);
    delete process.env.RATE_LIMIT_READ_PER_MIN;
    delete process.env.RATE_LIMIT_WRITE_PER_MIN;
  });
});
