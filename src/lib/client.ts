'use client';

/** 前端统一调用入口：与 MCP 共用同一套工具名（见 src/lib/tools.ts）。 */

export interface ApiError {
  error: string;
  status: number;
}

export async function call<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const e: ApiError = { error: data?.error || `请求失败(${res.status})`, status: res.status };
    throw e;
  }
  return data.data as T;
}

export async function callGet<T = any>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const res = await fetch(`/api/v1/${name}?${qs}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const e: ApiError = { error: data?.error || `请求失败(${res.status})`, status: res.status };
    throw e;
  }
  return data.data as T;
}

export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hhmm(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v < 0 ? '-' : ''}¥${Math.abs(v).toFixed(2)}`;
}
