'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useMe, useToast } from '@/components/Providers';
import { call, callGet, hhmm, money, moneyShort, todayLocal } from '@/lib/client';
import { kindMeta } from '@/lib/kinds';
import { EntryEditor, type EditableEntry } from '@/components/EntryEditor';
import { TaskEditor, type EditableTask } from '@/components/TaskEditor';

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
  meta: any;
}
interface Task {
  id: number;
  title: string;
  note: string | null;
  status: string;
  priority: number;
  planned_day: string | null;
  due_day: string | null;
  done_at: string | null;
  tags: string[];
}
interface DayData {
  day: string;
  pending: Task[];
  done: Task[];
  overdue: Task[];
  inbox: Task[];
  counts: { planned: number; done: number; overdue: number; inbox: number };
  entries: Record<string, Entry[]>;
  habits: Array<{ id: number; name: string; icon: string | null; kind: string; target: number | null; unit: string | null; value: number; done: boolean }>;
  finance: { expense: number; income: number; items: Entry[] };
  places: Array<{ id: number; happened_at: string; place_name: string | null; city: string | null; lat: number; lng: number }>;
  summary: { mood: number | null; energy: number | null; summary: string | null; ai_summary: string | null } | null;
}

export default function TodayPage() {
  return (
    <AppShell title="今日">
      <Gate>
        <Today />
      </Gate>
    </AppShell>
  );
}

function Today() {
  const { show } = useToast();
  const { reload: reloadMe, user } = useMe();
  const tz = user?.timezone;
  const [data, setData] = useState<DayData | null>(null);
  const [day, setDay] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [geoState, setGeoState] = useState<'idle' | 'asking' | 'done' | 'denied'>('idle');
  const [editTask, setEditTask] = useState<EditableTask | null>(null);
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null);
  const askedGeo = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await callGet<DayData>('get_day', { date: day });
      setData(d);
      if (!noteTouched) setNote(d.summary?.summary ?? '');
    } catch (e: any) {
      show(e.error || '加载失败', 'err');
    }
  }, [day, noteTouched, show]);

  useEffect(() => {
    load();
  }, [load]);

  const recordLocation = useCallback(
    async (silent = false) => {
      if (!navigator.geolocation) {
        if (!silent) show('浏览器不支持定位', 'err');
        return;
      }
      setGeoState('asking');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await call('log_location', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude ?? undefined,
              source: 'web',
            });
            setGeoState('done');
            await load();
            if (!silent) show('已记录当前位置');
          } catch (e: any) {
            show(e.error || '记录位置失败', 'err');
          }
        },
        (err) => {
          setGeoState('denied');
          if (!silent) show(err.message || '定位被拒绝', 'err');
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      );
    },
    [load, show],
  );

  // 打开页面时问一次位置（同一次会话只问一次，且今天已记录过就跳过）
  useEffect(() => {
    if (!data || askedGeo.current) return;
    askedGeo.current = true;
    const hasRecent = data.places.some((p) => Date.now() - new Date(p.happened_at).getTime() < 2 * 3600 * 1000);
    if (!hasRecent && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((st) => {
        if (st.state === 'granted') recordLocation(true);
      });
    }
  }, [data, recordLocation]);

  const patch = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (msg) show(msg);
      await Promise.all([load(), reloadMe()]);
    } catch (e: any) {
      show(e.error || '操作失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.entries).filter(([k]) => !['expense', 'income', 'done'].includes(k) && data.entries[k].length);
  }, [data]);

  const isToday = day === todayLocal();

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => setDay(shift(day, -1))}>
          ‹ 前一天
        </button>
        <input className="ipt" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 150 }} />
        <button className="btn ghost sm" disabled={isToday} onClick={() => setDay(shift(day, 1))}>
          后一天 ›
        </button>
        <span className="grow" />
        {!isToday && (
          <button className="btn sm" onClick={() => setDay(todayLocal())}>
            回到今天
          </button>
        )}
      </div>

      {isToday && <QuickCapture onDone={load} />}

      {/* 概览 */}
      {data && (
        <div className="grid3" style={{ marginBottom: 12 }}>
          <div className="stat">
            <div className="k">待办</div>
            <div className="v">
              {data.counts.done}
              <span className="faint" style={{ fontSize: 13, fontWeight: 400 }}>
                /{data.counts.planned + data.counts.done}
              </span>
            </div>
          </div>
          <div className="stat">
            <div className="k">支出</div>
            <div className="v money out" style={{ fontSize: 17 }} title={money(data.finance.expense)}>
              {moneyShort(data.finance.expense)}
            </div>
          </div>
          <div className="stat">
            <div className="k">收入</div>
            <div className="v money in" style={{ fontSize: 17 }} title={money(data.finance.income)}>
              {moneyShort(data.finance.income)}
            </div>
          </div>
        </div>
      )}

      {/* 打卡 */}
      {data && data.habits.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>🔥 习惯打卡</h2>
            <span className="grow" />
            <span className="sub">
              {data.habits.filter((h) => h.done).length}/{data.habits.length}
            </span>
          </div>
          <div className="habits">
            {data.habits.map((h) => (
              <button
                key={h.id}
                className={`habit ${h.done ? 'on' : ''}`}
                disabled={busy}
                onClick={() =>
                  patch(
                    () =>
                      h.done && h.kind === 'bool'
                        ? call('uncheck_habit', { habit: h.id, day })
                        : call('check_habit', { habit: h.id, day }),
                    h.done ? `已取消「${h.name}」` : `打卡「${h.name}」`,
                  )
                }
              >
                <span>{h.icon || '•'}</span>
                {h.name}
                {h.kind === 'count' && (
                  <span className="cnt">
                    {h.value}
                    {h.target ? `/${h.target}` : ''}
                    {h.unit || ''}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 待办 */}
      {data && (
        <div className="card">
          <div className="card-head">
            <h2>✅ 待办</h2>
            <span className="grow" />
            <span className="sub">
              {data.pending.length} 项待完成
              {data.counts.overdue > 0 && <span style={{ color: 'var(--red)' }}>，{data.counts.overdue} 项逾期</span>}
            </span>
          </div>

          <div className="row" style={{ marginBottom: 8 }}>
            <input
              className="ipt"
              placeholder="加一条待办…"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTask.trim()) {
                  patch(() => call('add_task', { title: newTask.trim(), planned_day: day }), '已添加');
                  setNewTask('');
                }
              }}
            />
            <button
              className="btn primary"
              disabled={busy || !newTask.trim()}
              onClick={() => {
                patch(() => call('add_task', { title: newTask.trim(), planned_day: day }), '已添加');
                setNewTask('');
              }}
            >
              添加
            </button>
          </div>

          {data.pending.length === 0 && data.done.length === 0 && <div className="empty">这一天还没有待办</div>}

          {data.pending.map((t) => (
            <div className="item" key={t.id}>
              <button
                className="check"
                disabled={busy}
                onClick={() => patch(() => call('complete_task', { task: t.id, day }), `完成：${t.title}`)}
              >
                ✓
              </button>
              <div className="body">
                <div className="title">
                  {t.priority >= 2 && <span className="pill red" style={{ marginRight: 6 }}>紧急</span>}
                  {t.priority === 1 && <span className="pill amber" style={{ marginRight: 6 }}>重要</span>}
                  {t.title}
                </div>
                {t.due_day && <div className="meta">截止 {t.due_day}</div>}
              </div>
              <button
                className="btn ghost sm"
                disabled={busy}
                title="顺延到明天"
                onClick={() => patch(() => call('postpone_task', { task: t.id }), '已顺延到明天')}
              >
                顺延
              </button>
              <button className="btn ghost sm" disabled={busy} title="编辑" onClick={() => setEditTask(t)}>
                ✏️
              </button>
            </div>
          ))}

          {data.done.length > 0 && (
            <>
              <div className="small faint" style={{ margin: '10px 0 2px' }}>
                — 已完成（{data.done.length}）—
              </div>
              {data.done.map((t) => (
                <div className="item done-item" key={t.id}>
                  <span className="check on" style={{ cursor: 'default' }}>
                    ✓
                  </span>
                  <div className="body">
                    <div className="title">{t.title}</div>
                    {t.done_at && <div className="meta">{hhmm(t.done_at, tz)} 完成</div>}
                  </div>
                  <button
                    className="btn ghost sm"
                    disabled={busy}
                    onClick={() => patch(() => call('update_task', { task: t.id, status: 'pending' }), '已恢复为待办')}
                  >
                    撤销
                  </button>
                  <button className="btn ghost sm" disabled={busy} title="编辑" onClick={() => setEditTask(t)}>
                    ✏️
                  </button>
                </div>
              ))}
            </>
          )}

          {data.overdue.length > 0 && (
            <>
              <div className="small faint" style={{ margin: '10px 0 2px', color: 'var(--red)' }}>
                — 逾期未完成 —
              </div>
              {data.overdue.map((t) => (
                <div className="item" key={t.id}>
                  <button className="check" disabled={busy} onClick={() => patch(() => call('complete_task', { task: t.id }), '已完成')}>
                    ✓
                  </button>
                  <div className="body">
                    <div className="title">
                      {t.title} <span className="pill red">原计划 {t.planned_day}</span>
                    </div>
                  </div>
                  <button className="btn ghost sm" disabled={busy} onClick={() => patch(() => call('postpone_task', { task: t.id }), '已顺延到今天')}>
                    今天做
                  </button>
                  <button className="btn ghost sm" disabled={busy} title="编辑" onClick={() => setEditTask(t)}>
                    ✏️
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 手工流水 */}
      {groups.map(([kind, items]) => {
        const meta = kindMeta(kind);
        return (
          <div className="card" key={kind}>
            <div className="card-head">
              <h2>
                {meta.icon} {meta.label}
              </h2>
              <span className="grow" />
              <span className="sub">{items.length} 条</span>
            </div>
            {items.map((e) => (
              <div className="item" key={e.id}>
                <span className="time">{hhmm(e.happened_at, tz)}</span>
                <div className="body">
                  {e.title && <div className="title">{e.title}</div>}
                  {e.content && <div className="content">{e.content}</div>}
                  {e.amount !== null && e.kind !== 'expense' && e.kind !== 'income' && (
                    <div className="meta">
                      {e.amount}
                      {e.category || e.meta?.unit || ''}
                    </div>
                  )}
                  {e.tags?.length > 0 && (
                    <div className="meta">
                      {e.tags.map((t) => (
                        <span className="pill" key={t} style={{ marginRight: 4 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* 收支明细 */}
      {data && data.finance.items.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>💰 今日收支</h2>
            <span className="grow" />
            <span className="sub">
              支出 {money(data.finance.expense)} · 收入 {money(data.finance.income)}
            </span>
          </div>
          {data.finance.items.map((e) => (
            <div className="item" key={e.id}>
              <span className="time">{hhmm(e.happened_at, tz)}</span>
              <div className="body">
                <div className="title">{e.title || e.content || (e.kind === 'expense' ? '支出' : '收入')}</div>
                <div className="meta">{e.category || '未分类'}</div>
              </div>
              <span className={`money ${e.kind === 'expense' ? 'out' : 'in'}`}>
                {e.kind === 'expense' ? '-' : '+'}
                {money(e.amount)}
              </span>
              <button className="btn ghost sm" title="编辑" onClick={() => setEditEntry(e)}>
                ✏️
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 位置 */}
      {data && (
        <div className="card">
          <div className="card-head">
            <h2>📍 位置</h2>
            <span className="grow" />
            <button className="btn sm" disabled={geoState === 'asking'} onClick={() => recordLocation(false)}>
              {geoState === 'asking' ? '定位中…' : '记录当前位置'}
            </button>
          </div>
          {data.places.length === 0 ? (
            <div className="empty">这一天还没有位置记录</div>
          ) : (
            <>
              {data.places.map((p) => (
                <div className="item" key={p.id}>
                  <span className="time">{hhmm(p.happened_at, tz)}</span>
                  <div className="body">
                    <div className="title">{p.place_name || p.city || '未知位置'}</div>
                    <div className="meta mono">
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 总结 + 心情 */}
      {data && (
        <div className="card">
          <div className="card-head">
            <h2>🪞 今天总结</h2>
          </div>
          <div className="row wrap" style={{ marginBottom: 6 }}>
            <span className="small muted" style={{ minWidth: 30 }}>
              心情
            </span>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                className={`habit ${data.summary?.mood === v ? 'on' : ''}`}
                style={{ padding: '4px 10px' }}
                disabled={busy}
                onClick={() => patch(() => call('save_summary', { day, mood: v }), '已记录心情')}
              >
                {['😞', '😕', '😐', '🙂', '😄'][v - 1]}
              </button>
            ))}
          </div>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            <span className="small muted" style={{ minWidth: 30 }}>
              精力
            </span>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                className={`habit ${data.summary?.energy === v ? 'on' : ''}`}
                style={{ padding: '4px 12px' }}
                disabled={busy}
                onClick={() => patch(() => call('save_summary', { day, energy: v }), '已记录精力')}
              >
                {v}
              </button>
            ))}
          </div>
          <textarea
            className="ipt"
            placeholder="写点什么…今天过得怎么样？"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteTouched(true);
            }}
            onBlur={() => {
              if (noteTouched) {
                patch(() => call('save_summary', { day, summary: note }), '已保存');
                setNoteTouched(false);
              }
            }}
          />
          {data.summary?.ai_summary && (
            <div className="small muted" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
              🤖 {data.summary.ai_summary}
            </div>
          )}
        </div>
      )}

      <TaskEditor task={editTask} onClose={() => setEditTask(null)} onChanged={load} />
      <EntryEditor entry={editEntry} onClose={() => setEditEntry(null)} onChanged={load} />
    </>
  );
}

function shift(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------------------------------------------------------------- 速记（AI 解析） */

interface CaptureOutcome {
  reply: string;
  actions: Array<{ tool: string; args: Record<string, unknown>; label: string; ok: boolean; error?: string }>;
  pending: Array<{ tool: string; args: Record<string, unknown>; label: string }>;
  undo: Array<{ tool: string; args: Record<string, unknown> }>;
  usedAi: boolean;
}

function QuickCapture({ onDone }: { onDone: () => Promise<void> }) {
  const { show } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  const [confirming, setConfirming] = useState(false);

  const send = async (raw?: string) => {
    const t = (raw ?? text).trim();
    if (!t) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch('/api/ai/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || '解析失败');
      setOutcome(json.data);
      setText('');
      await onDone();
    } catch (e: any) {
      show(e.message || '记录失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!outcome?.undo.length) return;
    setBusy(true);
    try {
      // 逆操作已按正确顺序排好，顺次执行即可
      for (const op of outcome.undo) {
        await call(op.tool as string, op.args as any);
      }
      show('已撤销');
      setOutcome(null);
      await onDone();
    } catch (e: any) {
      show(e.error || '撤销失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    if (!outcome?.pending.length) return;
    setConfirming(true);
    try {
      for (const op of outcome.pending) {
        await call(op.tool, op.args as any);
      }
      show('已执行');
      setOutcome(null);
      await onDone();
    } catch (e: any) {
      show(e.error || '执行失败', 'err');
    } finally {
      setConfirming(false);
    }
  };

  const done = outcome?.actions.filter((a) => a.ok) ?? [];

  return (
    <div className="capture">
      <textarea
        placeholder="直接说人话：记录一下明天要给车做保养 / 午饭 35 / 把买牛奶挪到明天 / 删掉刚才那条"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
        }}
        disabled={busy}
      />
      <div className="bar">
        <span className="faint small">
          {busy ? '✨ AI 正在理解…' : 'AI 解析：记录 / 修改 / 删除都能听懂'}
        </span>
        <span className="grow" />
        <button className="btn primary sm" disabled={busy || !text.trim()} onClick={() => send()}>
          {busy ? '理解中…' : '✨ 记一笔'}
        </button>
      </div>

      {outcome && (
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 15 }}>{outcome.usedAi ? '✨' : '📌'}</span>
            <div className="body small" style={{ flex: 1 }}>
              {outcome.reply || '（没有可执行的动作）'}
            </div>
            {outcome.undo.length > 0 && (
              <button className="btn ghost sm" disabled={busy} onClick={undo}>
                撤销
              </button>
            )}
          </div>

          {done.length > 0 && (
            <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
              {done.map((a, i) => (
                <span className="pill green" key={i}>
                  {a.label}
                </span>
              ))}
            </div>
          )}

          {outcome.actions.some((a) => !a.ok) && (
            <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
              {outcome.actions
                .filter((a) => !a.ok)
                .map((a, i) => (
                  <span className="pill red" key={i}>
                    {a.label}：{a.error}
                  </span>
                ))}
            </div>
          )}

          {outcome.pending.length > 0 && (
            <div
              className="row wrap"
              style={{ gap: 8, marginTop: 10, background: 'var(--amber-soft)', borderRadius: 10, padding: '9px 11px' }}
            >
              <span className="small" style={{ flex: 1 }}>
                ⚠️ 要执行删除：{outcome.pending.map((p) => p.label).join('；')}
              </span>
              <button className="btn sm" disabled={confirming} onClick={() => setOutcome(null)}>
                取消
              </button>
              <button className="btn primary sm" disabled={confirming} onClick={confirmPending}>
                {confirming ? '执行中…' : '确认'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
