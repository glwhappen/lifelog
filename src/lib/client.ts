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

/**
 * 按用户时区格式化时间。
 * 必须传 tz：服务器可能 UTC、浏览器可能又在另一时区，
 * 而「这天」是按用户配置时区算的，两者不一致会出现「23:00 的记录归到了第二天」。
 */
export function hhmm(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  } catch {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}

export function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v < 0 ? '-' : ''}¥${Math.abs(v).toFixed(2)}`;
}

/** 概览小卡片用的紧凑金额：大于一万/一亿时用 万/亿，避免把卡片撞破 */
export function moneyShort(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}¥${(a / 1e8).toFixed(2)}亿`;
  if (a >= 1e4) return `${sign}¥${(a / 1e4).toFixed(2)}万`;
  return money(v);
}
