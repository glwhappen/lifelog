'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useToast } from '@/components/Providers';
import { callGet, hhmm, money } from '@/lib/client';

interface Entry {
  id: number;
  kind: string;
  day: string;
  happened_at: string;
  title: string | null;
  content: string | null;
  amount: number | null;
  category: string | null;
  tags: string[];
  source: string;
  meta: any;
}

const KINDS: Array<[string, string, string]> = [
  ['', '全部', '🧭'],
  ['idea', '灵感', '💡'],
  ['note', '记录', '📝'],
  ['done', '完成', '✅'],
  ['expense,income', '收支', '💰'],
  ['workout', '运动', '🏃'],
  ['sleep,weight,water,mood,energy,focus', '健康', '❤️'],
  ['location', '位置', '📍'],
];

export default function TimelinePage() {
  return (
    <AppShell title="时间轴">
      <Gate>
        <Timeline />
      </Gate>
    </AppShell>
  );
}

function Timeline() {
  const { show } = useToast();
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await callGet<{ entries: Entry[] }>('query_entries', {
        kind: kind || undefined,
        days,
        q: q.trim() || undefined,
        limit: 800,
      });
      setEntries(r.entries);
    } catch (e: any) {
      show(e.error || '加载失败', 'err');
    } finally {
      setLoading(false);
    }
  }, [days, kind, q, show]);

  useEffect(() => {
    const t = setTimeout(load, q ? 320 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!m.has(e.day)) m.set(e.day, []);
      m.get(e.day)!.push(e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  return (
    <>
      <div className="card tight">
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          {[7, 30, 90, 365].map((d) => (
            <button key={d} className={`pill ${days === d ? 'accent' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setDays(d)}>
              近 {d} 天
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          {KINDS.map(([k, label, icon]) => (
            <button key={label} className={`pill ${kind === k ? 'accent' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setKind(k)}>
              {icon} {label}
            </button>
          ))}
        </div>
        <input className="ipt" placeholder="搜内容…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="card">
          <div className="empty">加载中…</div>
        </div>
      ) : byDay.length === 0 ? (
        <div className="card">
          <div className="empty">没有匹配的记录</div>
        </div>
      ) : (
        byDay.map(([day, items]) => (
          <div className="card" key={day}>
            <div className="card-head">
              <h2>{day}</h2>
              <span className="grow" />
              <span className="sub">{items.length} 条</span>
            </div>
            {items.map((e) => (
              <div className="item" key={e.id}>
                <span className="time">{hhmm(e.happened_at)}</span>
                <div className="body">
                  <div className="title">
                    {e.title && <b style={{ fontWeight: 600 }}>{e.title}</b>}
                    {e.title && e.content ? '　' : ''}
                    {e.content && <span>{e.content}</span>}
                    {!e.title && !e.content && <span className="faint">（无内容）</span>}
                  </div>
                  <div className="meta row wrap" style={{ gap: 5 }}>
                    <span className="pill">{e.kind}</span>
                    {e.category && <span className="pill">{e.category}</span>}
                    {e.tags?.map((t) => (
                      <span className="pill" key={t}>
                        #{t}
                      </span>
                    ))}
                    {e.source !== 'web' && <span className="faint">{e.source}</span>}
                  </div>
                </div>
                {e.amount !== null && e.amount !== undefined && (
                  <span className={`money ${e.kind === 'expense' ? 'out' : e.kind === 'income' ? 'in' : ''}`}>
                    {e.kind === 'expense' ? '-' : e.kind === 'income' ? '+' : ''}
                    {e.kind === 'expense' || e.kind === 'income' ? money(e.amount) : `${e.amount}${e.category || ''}`}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </>
  );
}
