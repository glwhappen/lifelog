'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useToast } from '@/components/Providers';
import { call, callGet } from '@/lib/client';
import { Flame, HabitIcon, HABIT_ICONS, Pencil, Plus, Trash2 } from '@/components/icons';

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
  const [newIcon, setNewIcon] = useState('sparkles');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const st = await callGet<HabitStat[]>('habit_stats', { days, with_cells: true });
      setStats(st);
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
                  <HabitIcon name={s.habit.icon} size={17} />
                  {s.habit.name}
                </h2>
                <span className="grow" />
                <span className={`pill ${s.currentStreak > 0 ? 'green' : ''}`}>连续 {s.currentStreak} 天</span>
                <span className="pill">最长 {s.longestStreak}</span>
                <button
                  className="btn ghost icon-btn danger"
                  disabled={busy}
                  title="删除习惯"
                  aria-label="删除习惯"
                  onClick={() => {
                    if (confirm(`删除习惯「${s.habit.name}」？其打卡记录也会一起删除。`)) {
                      run(() => call('delete_habit', { habit: s.habit.id }), '已删除');
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* 桌面端把热力图放到控件同一行的右侧，卡片才不会右半边空着 */}
              <div className="habit-body">
              <div className="row" style={{ gap: 8 }}>
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
                <span className="small muted">
                  {s.doneDays}/{s.totalDays} 天 · {(s.rate * 100).toFixed(0)}%
                </span>
              </div>

              {/* 按周对齐的热力图：每列 7 天，一眼看出「断在哪天」和星期规律 */}
              <HeatGrid cells={cells.slice(-182)} unit={s.habit.unit} kind={s.habit.kind} target={s.habit.target} />
              </div>
            </div>
          );
        })
      )}

      <div className="card">
        <div className="card-head">
          <h2>
            <Plus size={16} /> 新增习惯
          </h2>
        </div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          选个图标
        </div>
        <div className="icon-picker" style={{ marginBottom: 12 }}>
          {HABIT_ICONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={newIcon === key ? 'on' : ''}
              title={label}
              aria-label={label}
              onClick={() => setNewIcon(key)}
            >
              <Icon size={17} />
            </button>
          ))}
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
                  icon: newIcon,
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

/** 按周对齐的打卡热力图（GitHub 风格：每列 7 天，从周一开始） */
function HeatGrid({
  cells,
  kind,
  target,
  unit,
}: {
  cells: Array<{ day: string; value: number }>;
  kind: string;
  target: number | null;
  unit: string | null;
}) {
  if (!cells.length) return null;
  // 首日若不是周一，前面补空格，保证每一列都是同一个星期几
  const first = new Date(`${cells[0].day}T12:00:00Z`).getUTCDay(); // 0=周日
  const pad = (first + 6) % 7; // 周一=0
  return (
    <div className="heat" title="每列为一周，从周一到周日">
      {Array.from({ length: pad }, (_, i) => (
        <i key={`pad-${i}`} className="pad" />
      ))}
      {cells.map((c) => {
        const ratio = kind === 'count' && target ? c.value / target : Math.min(c.value, 1);
        const lvl = c.value <= 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.33 ? 2 : 1;
        return <i key={c.day} className={lvl ? `l${lvl}` : ''} title={`${c.day}（${weekday(c.day)}） ${c.value}${unit || ''}`} />;
      })}
    </div>
  );
}

function weekday(day: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${day}T12:00:00Z`).getUTCDay()];
}
