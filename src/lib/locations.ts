import { q } from './db';
import { normDay, resolveRange, todayIn } from './dates';
import type { LocationRow } from './types';

const COLS = `id, user_id, day, happened_at, lat, lng, accuracy, altitude, speed,
  place_name, city, region, country, address, source, entry_id, created_at`;

export interface LocationInput {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  place_name?: string;
  city?: string;
  region?: string;
  country?: string;
  address?: string;
  day?: string;
  at?: string;
  source?: string;
}

export async function addLocation(userId: string, tz: string, input: LocationInput): Promise<LocationRow> {
  const day = input.day ? normDay(input.day, tz) : todayIn(tz);
  const row = await q<LocationRow>(
    `insert into locations (user_id, day, happened_at, lat, lng, accuracy, altitude, speed,
       place_name, city, region, country, address, source)
     values ($1,$2, coalesce($3::timestamptz, now()), $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning ${COLS}`,
    [
      userId,
      day,
      input.at ?? null,
      input.lat,
      input.lng,
      input.accuracy ?? null,
      input.altitude ?? null,
      input.speed ?? null,
      input.place_name ?? null,
      input.city ?? null,
      input.region ?? null,
      input.country ?? null,
      input.address ?? null,
      input.source ?? 'web',
    ],
  );
  return row[0]!;
}

export async function listLocations(
  userId: string,
  tz: string,
  query: { from?: unknown; to?: unknown; days?: unknown; range?: unknown; limit?: number } = {},
): Promise<LocationRow[]> {
  const { from, to } = resolveRange(query, tz);
  const limit = Math.min(Math.max(Number(query.limit) || 2000, 1), 20000);
  return q<LocationRow>(
    `select ${COLS} from locations
      where user_id = $1 and day between $2 and $3
      order by happened_at asc limit $4`,
    [userId, from, to, limit],
  );
}

export async function deleteLocation(userId: string, id: number): Promise<boolean> {
  const rows = await q('delete from locations where id = $1 and user_id = $2 returning id', [id, userId]);
  return rows.length > 0;
}

/** 轨迹统计：总里程（相邻点 haversine 累加）与停留点概览 */
export function trackStats(points: Array<{ lat: number; lng: number; happened_at?: string }>) {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return { points: points.length, km: Math.round((meters / 1000) * 10) / 10 };
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GpxPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: string;
}

/** 极简 GPX 解析（不引依赖）：支持 trkpt / wpt / rtept */
export function parseGpx(xml: string): GpxPoint[] {
  const out: GpxPoint[] = [];
  const re = /<(trkpt|wpt|rtept)\b([^>]*)>([\s\S]*?)<\/\1>|<(trkpt|wpt|rtept)\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[2] ?? m[5] ?? '';
    const body = m[3] ?? '';
    const lat = Number(/\blat="([-\d.]+)"/.exec(attrs)?.[1]);
    const lon = Number(/\blon="([-\d.]+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = Number(/<ele>\s*([-\d.]+)\s*<\/ele>/.exec(body)?.[1]);
    const time = /<time>\s*([^<\s]+)\s*<\/time>/.exec(body)?.[1];
    out.push({ lat, lng: lon, ele: Number.isFinite(ele) ? ele : undefined, time });
  }
  return out;
}

/**
 * 导入轨迹点：默认按「最小间距 80m 或最小间隔 3 分钟」抽稀，避免一天几千个点。
 */
export async function importTrack(
  userId: string,
  tz: string,
  points: GpxPoint[],
  opts: { minMeters?: number; minSeconds?: number; source?: string; placeName?: string } = {},
): Promise<{ imported: number; skipped: number }> {
  const minMeters = opts.minMeters ?? 80;
  const minSeconds = opts.minSeconds ?? 180;
  const kept: GpxPoint[] = [];
  let last: { p: GpxPoint; t: number } | null = null;
  for (const p of points) {
    const t = p.time ? new Date(p.time).getTime() : NaN;
    if (!last) {
      kept.push(p);
      last = { p, t };
      continue;
    }
    const dist = haversine(last.p.lat, last.p.lng, p.lat, p.lng);
    const dt = Number.isFinite(t) && Number.isFinite(last.t) ? (t - last.t) / 1000 : Infinity;
    if (dist >= minMeters || dt >= minSeconds) {
      kept.push(p);
      last = { p, t };
    }
  }

  let imported = 0;
  for (const p of kept) {
    const when = p.time ? new Date(p.time) : new Date();
    const day = dayInTz(when, tz);
    await q(
      `insert into locations (user_id, day, happened_at, lat, lng, altitude, place_name, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, day, when.toISOString(), p.lat, p.lng, p.ele ?? null, opts.placeName ?? null, opts.source ?? 'gpx'],
    );
    imported++;
  }
  return { imported, skipped: points.length - kept.length };
}

function dayInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * 逆地理编码（可选）：把经纬度换成可读地名。
 * 通过 GEOCODE_URL 配置（支持 {lat}/{lng} 占位），失败静默返回 null，绝不阻塞记录。
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{ place_name?: string; city?: string; region?: string; country?: string } | null> {
  const tpl = process.env.GEOCODE_URL;
  if (!tpl) return null;
  const url = tpl.replace('{lat}', String(lat)).replace('{lng}', String(lng));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'LifeLog/0.1' } });
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      place_name: data.display_name ?? data.name ?? undefined,
      city: data.address?.city ?? data.address?.town ?? data.address?.county ?? undefined,
      region: data.address?.state ?? undefined,
      country: data.address?.country ?? undefined,
    };
  } catch {
    return null;
  }
}
