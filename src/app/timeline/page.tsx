'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useMe, useToast } from '@/components/Providers';
import { callGet, hhmm, money } from '@/lib/client';
import { kindMeta } from '@/lib/kinds';
import { KindIcon, Pencil } from '@/components/icons';
import { EntryEditor, type EditableEntry } from '@/components/EntryEditor';

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
  ['', '全部', 'note'],
  ['idea', '灵感', 'idea'],
  ['note', '记录', 'note'],
  ['done', '完成', 'done'],
  ['expense,income', '收支', 'expense'],
  ['workout', '运动', 'workout'],
  ['sleep,weight,water,mood,energy,focus', '健康', 'sleep'],
  ['location', '位置', 'location'],
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
  const { user } = useMe();
  const tz = user?.timezone;
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditableEntry | null>(null);

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
          {KINDS.map(([k, label, iconKind]) => (
            <button
              key={label}
              className={`pill ${kind === k ? 'accent' : ''}`}
              style={{ cursor: 'pointer', border: 0 }}
              onClick={() => setKind(k)}
            >
              <KindIcon kind={iconKind} size={13} /> {label}
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
            {items.map((e) => {
              const meta = kindMeta(e.kind);
              const isMoney = e.kind === 'expense' || e.kind === 'income';
              const hasText = Boolean(e.title || e.content);
              const unit = e.category || e.meta?.unit || meta.unit || '';
              return (
                <div className="item" key={e.id}>
                  <span className="time">{hhmm(e.happened_at, tz)}</span>
                  <div className="body">
                    <div className="title" style={{ whiteSpace: 'pre-wrap' }}>
                      {e.title && <b style={{ fontWeight: 600 }}>{e.title}</b>}
                      {e.title && e.content ? '　' : ''}
                      {e.content && <span>{e.content}</span>}
                    </div>
                    <div className="meta row wrap" style={{ gap: 5 }}>
                      <span className="pill">
                        <KindIcon kind={e.kind} size={13} /> {meta.label}
                      </span>
                      {/* 数值型的 category 就是单位（已显示在右侧），不再重复成标签 */}
                      {!meta.numeric && e.category && <span className="pill">{e.category}</span>}
                      {e.tags?.map((t) => (
                        <span className="pill" key={t}>
                          #{t}
                        </span>
                      ))}
                      {e.source !== 'web' && <span className="faint">{e.source}</span>}
                    </div>
                  </div>
                  {isMoney ? (
                    <span className={`money ${e.kind === 'expense' ? 'out' : 'in'}`}>
                      {e.kind === 'expense' ? '-' : '+'}
                      {money(e.amount)}
                    </span>
                  ) : (
                    e.amount !== null &&
                    e.amount !== undefined && (
                      <span className="mono" style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
                        {e.amount}
                        {unit}
                      </span>
                    )
                  )}
                  <button className="btn ghost icon-btn" title="编辑" aria-label="编辑" onClick={() => setEdit(e)}>
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ))
      )}

      <EntryEditor entry={edit} onClose={() => setEdit(null)} onChanged={load} />
    </>
  );
}
