import { describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

/** 用一个最小的假请求去撞中间件（它只读 method / origin / host / authorization） */
function run(
  method: string,
  headers: Record<string, string> = {},
): { status?: number; passed: boolean } {
  const req = {
    method,
    headers: new Headers(headers),
    nextUrl: new URL('https://life.example.com/api/v1/add_task'),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = middleware(req as any);
  // NextResponse.next() 会把 status 留在内部；用 x-middleware-next 头判断是否放行
  const isNext = res.headers.get('x-middleware-next') === '1';
  return { status: res.status, passed: isNext };
}

describe('middleware —— CSRF / Origin 校验', () => {
  it('读请求一律放行', () => {
    expect(run('GET').passed).toBe(true);
    expect(run('HEAD').passed).toBe(true);
    expect(run('OPTIONS').passed).toBe(true);
  });

  it('写请求：同源放行', () => {
    expect(run('POST', { origin: 'https://life.example.com', host: 'life.example.com' }).passed).toBe(true);
    expect(run('DELETE', { origin: 'https://life.example.com', host: 'life.example.com' }).passed).toBe(true);
  });

  it('写请求：反代场景看 x-forwarded-host', () => {
    expect(
      run('POST', { origin: 'https://life.example.com', 'x-forwarded-host': 'life.example.com' }).passed,
    ).toBe(true);
  });

  it('写请求：跨站 Origin 被 403 拦住', () => {
    const r = run('POST', { origin: 'https://evil.example.com', host: 'life.example.com' });
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('写请求：同主域不同端口也算跨站（Origin 含端口，host 不含）', () => {
    const r = run('POST', { origin: 'https://life.example.com:8443', host: 'life.example.com' });
    expect(r.passed).toBe(false);
  });

  it('带 Bearer 的写请求直接放行（API Key 调用不受 CSRF 影响）', () => {
    const r = run('POST', {
      authorization: 'Bearer ll-xxx',
      origin: 'https://some-mcp-host.example.com',
      host: 'life.example.com',
    });
    expect(r.passed).toBe(true);
  });

  it('没有 Origin 时放行（curl / 服务端调用；浏览器跨站请求一定带 Origin）', () => {
    expect(run('POST', { host: 'life.example.com' }).passed).toBe(true);
  });

  it('垃圾 Origin 不抛错，按跨站处理', () => {
    const r = run('POST', { origin: 'not-a-url', host: 'life.example.com' });
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });
});
