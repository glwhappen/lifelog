'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useToast } from '@/components/Providers';
import { call, callGet } from '@/lib/client';

interface Habit {
  id: number;
  name: string;
  icon: string | null;
  kind: string;
  target: number | null;
  unit: string | null;
}
interface HabitStat {
  habit: Habit;
  doneDays: number;
  totalDays: number;
  rate: number;
  currentStreak: number;
  longestStreak: number;
  today: number;
  cells?: Array<{ day: string; value: number }>;
}

export default function HabitsPage() {
  return (
    <AppShell title="打卡">
      <Gate>
        <Habits />
      </Gate>
    </AppShell>
  );
}

function Habits() {
  const { show } = useToast();
  const [stats, setStats] = useState<HabitStat[]>([]);
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'bool' | 'count'>('bool');
  const [newTarget, setNewTarget] = useState('');
  const [newUnit, setNewUnit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        callGet<Habit[]>('list_habits'),
        callGet<HabitStat[]>('habit_stats', { days }),
      ]);
      const byId = new Map(list.map((h) => [h.id, h]));
      setStats(st.map((s) => ({ ...s, habit: byId.get(s.habit.id) ?? s.habit })));
    } catch (e: any) {
      show(e.error || '加载失败', 'err');
    } finally {
      setLoading(false);
    }
  }, [days, show]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (msg) show(msg);
      await load();
    } catch (e: any) {
      show(e.error || '操作失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const maxDone = Math.max(1, ...stats.map((s) => s.doneDays));
  void maxDone;

  return (
    <>
      <div className="card tight">
        <div className="row wrap" style={{ gap: 6 }}>
          {[30, 90, 180, 365].map((d) => (
            <button
              key={d}
              className={`pill ${days === d ? 'accent' : ''}`}
              style={{ cursor: 'pointer', border: 0 }}
              onClick={() => setDays(d)}
            >
              近 {d} 天
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty">加载中…</div>
        </div>
      ) : (
        stats.map((s) => {
          const cells = s.cells ?? [];
          return (
            <div className="card" key={s.habit.id}>
              <div className="card-head">
                <h2>
                  {s.habit.icon || '🔥'} {s.habit.name}
                </h2>
                <span className="grow" />
                <span className="pill green">连续 {s.currentStreak} 天</span>
                <span className="pill">最长 {s.longestStreak}</span>
              </div>

              <div className="row" style={{ marginBottom: 10, gap: 8 }}>
                <button
                  className={`habit ${s.today >= 1 && s.habit.kind === 'bool' ? 'on' : ''}`}
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        s.habit.kind === 'count'
                          ? call('check_habit', { habit: s.habit.id })
                          : s.today >= 1
                            ? call('uncheck_habit', { habit: s.habit.id })
                            : call('check_habit', { habit: s.habit.id }),
                      '已更新',
                    )
                  }
                >
                  {s.habit.kind === 'count' ? `+1 ${s.habit.unit || ''}` : s.today >= 1 ? '今日已打卡' : '今日打卡'}
                </button>
                {s.habit.kind === 'count' && (
                  <span className="mono muted">
                    {s.today}
                    {s.habit.target ? `/${s.habit.target}` : ''} {s.habit.unit || ''}
                  </span>
                )}
                <span className="grow" />
                <span className="small muted">
                  {s.doneDays}/{s.totalDays} 天 · {(s.rate * 100).toFixed(0)}%
                </span>
                <button
                  className="btn ghost sm danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`删除习惯「${s.habit.name}」？其打卡记录也会一起删除。`)) {
                      run(() => call('delete_habit', { habit: s.habit.id }), '已删除');
                    }
                  }}
                >
                  删除
                </button>
              </div>

              <div className="heat" title="最近打卡热力">
                {cells.slice(-182).map((c) => {
                  const ratio = s.habit.kind === 'count' && s.habit.target ? c.value / s.habit.target : Math.min(c.value, 1);
                  const lvl = c.value <= 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.33 ? 2 : 1;
                  return <i key={c.day} className={lvl ? `l${lvl}` : ''} title={`${c.day} ${c.value}${s.habit.unit || ''}`} />;
                })}
              </div>
            </div>
          );
        })
      )}

      <div className="card">
        <div className="card-head">
          <h2>新增习惯</h2>
        </div>
        <div className="row wrap">
          <input className="ipt grow" placeholder="习惯名，如 冥想" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ minWidth: 140 }} />
          <select className="ipt" value={newKind} onChange={(e) => setNewKind(e.target.value as 'bool' | 'count')} style={{ width: 108 }}>
            <option value="bool">打卡型</option>
            <option value="count">计数型</option>
          </select>
          {newKind === 'count' && (
            <>
              <input className="ipt" placeholder="目标" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} style={{ width: 74 }} />
              <input className="ipt" placeholder="单位" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} style={{ width: 74 }} />
            </>
          )}
          <button
            className="btn primary"
            disabled={busy || !newName.trim()}
            onClick={() =>
              run(async () => {
                await call('add_habit', {
                  name: newName.trim(),
                  kind: newKind,
                  target: newKind === 'count' && newTarget ? Number(newTarget) : undefined,
                  unit: newKind === 'count' ? newUnit || undefined : undefined,
                });
                setNewName('');
                setNewTarget('');
                setNewUnit('');
              }, '已添加习惯')
            }
          >
            添加
          </button>
        </div>
      </div>
    </>
  );
}
