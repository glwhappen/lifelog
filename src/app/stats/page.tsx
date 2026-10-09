'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useToast } from '@/components/Providers';
import { callGet, money } from '@/lib/client';
import { kindLabel } from '@/lib/kinds';

interface Overview {
  from: string;
  to: string;
  activeDays: number;
  totalDays: number;
  entries: number;
  byKind: Array<{ kind: string; n: number }>;
  tasks: { created: number; done: number; rate: number };
  finance: { expense: number; income: number; net: number; byCategory: Array<{ key: string; expense: number }> };
  habits: Array<{ name: string; icon: string | null; doneDays: number; totalDays: number; rate: number; currentStreak: number }>;
  metrics: Array<{ kind: string; unit: string | null; avg: number | null; min: number | null; max: number | null; last: number | null; n: number }>;
  topTags: Array<{ tag: string; n: number }>;
  daily: Array<{ day: string; entries: number; done: number; expense: number; income: number }>;
}

export default function StatsPage() {
  return (
    <AppShell title="统计">
      <Gate>
        <Stats />
      </Gate>
    </AppShell>
  );
}

function Stats() {
  const { show } = useToast();
  const [range, setRange] = useState('month');
  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOv(await callGet<Overview>('stats_overview', { range }));
    } catch (e: any) {
      show(e.error || '加载失败', 'err');
    } finally {
      setLoading(false);
    }
  }, [range, show]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !ov) {
    return (
      <div className="card">
        <div className="empty">加载中…</div>
      </div>
    );
  }

  const maxEntries = Math.max(1, ...ov.daily.map((d) => d.entries));
  const maxKind = Math.max(1, ...ov.byKind.map((k) => k.n));

  return (
    <>
      <div className="card tight">
        <div className="row wrap" style={{ gap: 6 }}>
          {[
            ['week', '近 7 天'],
            ['month', '近 30 天'],
            ['year', '近一年'],
          ].map(([k, label]) => (
            <button key={k} className={`pill ${range === k ? 'accent' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setRange(k)}>
              {label}
            </button>
          ))}
          <span className="grow" />
          <span className="faint small">
            {ov.from} ~ {ov.to}
          </span>
        </div>
      </div>

      <div className="grid3" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="k">活跃天数</div>
          <div className="v">
            {ov.activeDays}
            <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>/{ov.totalDays}</span>
          </div>
        </div>
        <div className="stat">
          <div className="k">记录条数</div>
          <div className="v">{ov.entries}</div>
        </div>
        <div className="stat">
          <div className="k">任务完成率</div>
          <div className="v">{(ov.tasks.rate * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>📅 每日记录量</h2>
          <span className="grow" />
          <span className="sub">
            完成 {ov.tasks.done} · 新建 {ov.tasks.created}
          </span>
        </div>
        {ov.entries > 0 && (
        <div className="bars">
          {ov.daily.slice(-90).map((d) => (
            <div
              key={d.day}
              className="b"
              style={{
                height: `${(d.entries / maxEntries) * 100}%`,
                minHeight: d.entries > 0 ? 3 : 0, // 空值是 0 高度，否则整排会连成一条「虚线」像坏掉
              }}
              title={`${d.day}\n记录 ${d.entries} 条 · 完成 ${d.done} 项`}
            />
          ))}
        </div>
        )}
        {ov.entries === 0 && <div className="empty">这段时间还没有记录</div>}
      </div>

      <div className="grid-cards">
        <div className="card">
          <div className="card-head">
            <h2>🏷️ 记录类型分布</h2>
          </div>
          {ov.byKind.length === 0 ? (
            <div className="empty">暂无数据</div>
          ) : (
            ov.byKind.map((k) => (
              <div key={k.kind} style={{ marginBottom: 8 }}>
                <div className="row small">
                  <span className="grow">{kindLabel(k.kind)}</span>
                  <span className="mono faint">{k.n}</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-sub)', borderRadius: 999, marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${(k.n / maxKind) * 100}%`, background: 'var(--purple)', borderRadius: 999 }} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>🔥 习惯坚持</h2>
          </div>
          {ov.habits.length === 0 ? (
            <div className="empty">还没有习惯</div>
          ) : (
            ov.habits.map((h) => (
              <div className="item" key={h.name}>
                <div className="body">
                  <div className="title">
                    {h.icon || '•'} {h.name}
                  </div>
                  <div className="meta">
                    {h.doneDays}/{h.totalDays} 天
                  </div>
                </div>
                <span className="pill green">连续 {h.currentStreak} 天</span>
                <span className="mono faint" style={{ width: 40, textAlign: 'right' }}>
                  {(h.rate * 100).toFixed(0)}%
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {ov.metrics.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>📊 健康与状态指标</h2>
          </div>
          {ov.metrics.map((m) => (
            <div className="item" key={m.kind + (m.unit ?? '')}>
              <div className="body">
                <div className="title">
                  {kindLabel(m.kind)} {m.unit ? <span className="faint small">({m.unit})</span> : null}
                </div>
                <div className="meta">
                  均值 {m.avg} · 区间 {m.min} ~ {m.max} · 共 {m.n} 次
                </div>
              </div>
              <span className="mono" style={{ fontSize: 17, fontWeight: 600 }}>
                {m.last}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid-cards">
        <div className="card">
          <div className="card-head">
            <h2>💰 收支</h2>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="muted small">支出</span>
            <span className="money out">{money(ov.finance.expense)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="muted small">收入</span>
            <span className="money in">{money(ov.finance.income)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">净额</span>
            <span className="money" style={{ color: ov.finance.net === 0 ? 'var(--fg)' : ov.finance.net > 0 ? 'var(--green)' : 'var(--red)' }}>
              {money(ov.finance.net)}
            </span>
          </div>
          {ov.finance.byCategory.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              {ov.finance.byCategory.slice(0, 6).map((c) => (
                <div className="row small" key={c.key} style={{ justifyContent: 'space-between', padding: '3px 0' }}>
                  <span className="muted">{c.key}</span>
                  <span className="mono">{money(c.expense)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2># 常用标签</h2>
          </div>
          {ov.topTags.length === 0 ? (
            <div className="empty">暂无标签</div>
          ) : (
            <div className="row wrap" style={{ gap: 6 }}>
              {ov.topTags.map((t) => (
                <span className="pill accent" key={t.tag}>
                  #{t.tag} <span className="faint">{t.n}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
