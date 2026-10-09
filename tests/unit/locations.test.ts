import { describe, expect, it } from 'vitest';
import { decimateTrack, haversine, parseGpx, trackStats } from '@/lib/locations';

describe('haversine —— 球面距离', () => {
  it('同一点距离为 0', () => {
    expect(haversine(22.54, 113.93, 22.54, 113.93)).toBe(0);
  });

  it('与已知距离吻合（深圳→北京 ≈ 1940km，误差 <2%）', () => {
    const km = haversine(22.5431, 114.0579, 39.9042, 116.4074) / 1000;
    expect(km).toBeGreaterThan(1900);
    expect(km).toBeLessThan(1980);
  });

  it('纬度 1 度 ≈ 111km', () => {
    const km = haversine(0, 0, 1, 0) / 1000;
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it('对称：A→B 等于 B→A', () => {
    const a = haversine(22.5, 113.9, 39.9, 116.4);
    const b = haversine(39.9, 116.4, 22.5, 113.9);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });

  it('跨日界线不会算出负数或天文数字', () => {
    const d = haversine(0, 179.9, 0, -179.9);
    expect(d).toBeGreaterThan(0);
    expect(d / 1000).toBeLessThan(25); // 约 22km
  });
});

describe('trackStats', () => {
  it('累加相邻点距离并返回公里数', () => {
    // 沿纬度走 0.01 度 ≈ 1.11km
    const r = trackStats([
      { lat: 0, lng: 0 },
      { lat: 0.01, lng: 0 },
      { lat: 0.02, lng: 0 },
    ]);
    expect(r.points).toBe(3);
    expect(r.km).toBeGreaterThan(2.1);
    expect(r.km).toBeLessThan(2.4);
  });

  it('单点/空数组不炸', () => {
    expect(trackStats([]).km).toBe(0);
    expect(trackStats([{ lat: 1, lng: 1 }]).km).toBe(0);
  });
});

describe('parseGpx —— 极简 GPX 解析', () => {
  const gpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="22.5400" lon="113.9300"><name>起点</name></wpt>
  <trk><trkseg>
    <trkpt lat="22.5405" lon="113.9344"><ele>12.5</ele><time>2026-10-02T08:00:00Z</time></trkpt>
    <trkpt lon="113.9400" lat="22.5440"><ele>15</ele><time>2026-10-02T08:05:00Z</time></trkpt>
    <trkpt lat="22.5450" lon="113.9450"/>
  </trkseg></trk>
  <rte><rtept lat="22.5500" lon="113.9500"/></rte>
</gpx>`;

  it('解析 trkpt / wpt / rtept', () => {
    const pts = parseGpx(gpx);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toMatchObject({ lat: 22.54, lng: 113.93 }); // wpt
    expect(pts[4]).toMatchObject({ lat: 22.55, lng: 113.95 }); // rtept
  });

  it('属性顺序颠倒也能解析', () => {
    const pts = parseGpx(gpx);
    // 第 2 个 trkpt 故意写成 lon 在前
    expect(pts[2]).toMatchObject({ lat: 22.544, lng: 113.94 });
  });

  it('带出 ele 与 time，缺失时为 undefined', () => {
    const pts = parseGpx(gpx);
    // pts[0] 是 wpt（无 ele/time），pts[1] 起才是 trkpt
    expect(pts[0].ele).toBeUndefined();
    expect(pts[1].ele).toBe(12.5);
    expect(pts[1].time).toBe('2026-10-02T08:00:00Z');
    expect(pts[2].ele).toBe(15);
    expect(pts[3].ele).toBeUndefined();
    expect(pts[3].time).toBeUndefined();
  });

  it('自闭合标签（无子元素）也认', () => {
    const pts = parseGpx('<gpx><trkpt lat="1.5" lon="2.5"/></gpx>');
    expect(pts).toEqual([{ lat: 1.5, lng: 2.5, ele: undefined, time: undefined }]);
  });

  it('缺经纬度或值非法的点被跳过，不抛错', () => {
    const pts = parseGpx(`<gpx>
      <trkpt lat="abc" lon="113"/>
      <trkpt lat="22"/>
      <trkpt lat="22.5" lon="113.9"/>
    </gpx>`);
    expect(pts).toHaveLength(1);
    expect(pts[0].lat).toBe(22.5);
  });

  it('空 / 非 GPX 内容返回空数组', () => {
    expect(parseGpx('')).toEqual([]);
    expect(parseGpx('<html>not gpx</html>')).toEqual([]);
  });
});

describe('decimateTrack —— 轨迹抽稀', () => {
  it('保留首点，间距不足的点被丢弃', () => {
    // 每步约 11m，默认 80m 阈值 → 大约每 8 个点保留 1 个
    const pts = Array.from({ length: 100 }, (_, i) => ({ lat: 22.5 + i * 0.0001, lng: 113.9 }));
    const { kept, skipped } = decimateTrack(pts);
    expect(kept[0]).toBe(pts[0]);
    expect(kept.length).toBeGreaterThan(8);
    expect(kept.length).toBeLessThan(20);
    expect(kept.length + skipped).toBe(100);
  });

  it('间距够大时全部保留', () => {
    const pts = [
      { lat: 22.5, lng: 113.9 },
      { lat: 22.6, lng: 113.9 }, // ≈11km
      { lat: 22.7, lng: 113.9 },
    ];
    const { kept, skipped } = decimateTrack(pts);
    expect(kept).toHaveLength(3);
    expect(skipped).toBe(0);
  });

  it('静止但时间跨度大时按时间保留（等红灯也留个点）', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({
      lat: 22.5,
      lng: 113.9,
      time: new Date(Date.UTC(2026, 9, 2, 8, 0, i * 30)).toISOString(), // 每 30 秒
    }));
    const { kept } = decimateTrack(pts, { minMeters: 80, minSeconds: 180 });
    expect(kept.length).toBeGreaterThan(1);
    expect(kept.length).toBeLessThan(20);
  });

  it('没有时间戳时只按距离抽稀（回归：以前 dt=Infinity 会导致一点不抽）', () => {
    const pts = Array.from({ length: 500 }, (_, i) => ({ lat: 22.5 + i * 0.00002, lng: 113.9 }));
    const { kept } = decimateTrack(pts);
    expect(kept.length).toBeLessThan(50);
    expect(kept.length).toBeGreaterThan(0);
  });

  it('空数组与单点', () => {
    expect(decimateTrack([])).toEqual({ kept: [], skipped: 0 });
    const one = [{ lat: 1, lng: 1 }];
    expect(decimateTrack(one).kept).toEqual(one);
  });

  it('阈值可配置', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ lat: 22.5 + i * 0.001, lng: 113.9 })); // 每步≈111m
    expect(decimateTrack(pts, { minMeters: 50 }).kept).toHaveLength(10);
    expect(decimateTrack(pts, { minMeters: 500 }).kept.length).toBeLessThan(10);
  });
});
