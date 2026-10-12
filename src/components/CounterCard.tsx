'use client';

import { useEffect, useState } from 'react';
import { useToast } from './Providers';
import { call, todayLocal } from '@/lib/client';
import { CounterIcon, COUNTER_ICONS, Plus, Trash2 } from './icons';
import { Sheet, Field } from './Sheet';

export interface CounterView {
  id: number;
  name: string;
  icon: string | null;
  start_day: string;
  mode: string;
  repeat: string;
  days: number;
  ordinal: number;
  label: string;
  years: number | null;
  nextDay: string | null;
  daysToNext: number | null;
  isToday: boolean;
  note: string | null;
}

/** 一行纪念日 */
function CounterRow({ c, onEdit }: { c: CounterView; onEdit: () => void }) {
  const since = c.mode === 'since';
  return (
    <button
      className="counter-row"
      onClick={onEdit}
      title="点击编辑"
      style={c.isToday ? { background: 'var(--accent-soft)', borderRadius: 10, padding: '9px 10px' } : undefined}
    >
      <span className="counter-ic">
        <CounterIcon name={c.icon} size={17} />
      </span>
      <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
        <span className="row" style={{ gap: 6 }}>
          <b style={{ fontWeight: 600 }}>{c.name}</b>
          {c.isToday && <span className="pill accent">就是今天</span>}
        </span>
        <span className="meta" style={{ display: 'block' }}>
          {c.start_day}
          {c.years !== null && since && ` · 已 ${c.years} 周年`}
          {c.years !== null && !since && ` · 第 ${c.years} 个`}
          {since && c.daysToNext !== null && c.daysToNext > 0 && ` · 距下一个 ${c.daysToNext} 天`}
        </span>
      </span>
      <span className={`counter-num ${c.isToday ? 'accent' : ''}`}>{c.label}</span>
    </button>
  );
}

/** 今日页末尾的纪念日卡片 */
export function CounterCard({
  counters,
  onChanged,
}: {
  counters: CounterView[];
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<CounterView | null>(null);

  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <CounterIcon name="heart" size={16} /> 纪念日
        </h2>
        <span className="grow" />
        <button className="btn ghost sm row" style={{ gap: 4 }} onClick={() => setEditing(emptyCounter())}>
          <Plus size={14} />
          添加
        </button>
      </div>

      {counters.length === 0 ? (
        <div className="empty">
          <CounterIcon name="gem" size={26} style={{ opacity: 0.35, marginBottom: 6 }} />
          <div>还没有纪念日</div>
          <div className="faint small" style={{ marginTop: 4 }}>
            记一个「结婚纪念日」或「离职」，这里会一直帮你数着
          </div>
        </div>
      ) : (
        counters.map((c) => <CounterRow key={c.id} c={c} onEdit={() => setEditing(c)} />)
      )}

      <CounterEditor
        counter={editing}
        onClose={() => setEditing(null)}
        onChanged={async () => {
          await onChanged();
        }}
      />
    </div>
  );
}

function emptyCounter(): CounterView {
  return {
    id: 0,
    name: '',
    icon: 'heart',
    start_day: todayLocal(),
    mode: 'since',
    repeat: 'none',
    days: 0,
    ordinal: 1,
    label: '',
    years: null,
    nextDay: null,
    daysToNext: null,
    isToday: false,
    note: null,
  };
}

/** 新增 / 编辑纪念日 */
function CounterEditor({
  counter,
  onClose,
  onChanged,
}: {
  counter: CounterView | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { show } = useToast();
  const [name, setName] = useState('');
  const [startDay, setStartDay] = useState('');
  const [mode, setMode] = useState<'since' | 'until'>('since');
  const [repeat, setRepeat] = useState<'none' | 'yearly'>('none');
  const [icon, setIcon] = useState('heart');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // 打开时把值灌进表单（依赖 counter.id，换了一条才重置，不覆盖正在输入的内容）
  useEffect(() => {
    if (!counter) return;
    setName(counter.name);
    setStartDay(counter.start_day);
    setMode(counter.mode === 'until' ? 'until' : 'since');
    setRepeat(counter.repeat === 'yearly' ? 'yearly' : 'none');
    setIcon(counter.icon ?? 'heart');
    setNote(counter.note ?? '');
  }, [counter]);

  if (!counter) return null;
  const isNew = counter.id === 0;

  const save = async () => {
    if (!name.trim()) {
      show('给它起个名字', 'err');
      return;
    }
    if (!startDay) {
      show('选个日期', 'err');
      return;
    }
    setBusy(true);
    try {
      const args = { name: name.trim(), start_day: startDay, mode, repeat, icon, note: note.trim() || null };
      if (isNew) await call('add_counter', args);
      else await call('update_counter', { counter: counter.id, ...args });
      show(isNew ? '已添加' : '已保存');
      await onChanged();
      onClose();
    } catch (e: any) {
      show(e.error || '保存失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`删除纪念日「${counter.name}」？`)) return;
    setBusy(true);
    try {
      await call('delete_counter', { counter: counter.id });
      show('已删除');
      await onChanged();
      onClose();
    } catch (e: any) {
      show(e.error || '删除失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={isNew ? '添加纪念日' : '编辑纪念日'}
      icon={<CounterIcon name={icon} size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary grow" disabled={busy} onClick={save}>
            保存
          </button>
          {!isNew && (
            <button className="btn danger row" style={{ gap: 5 }} disabled={busy} onClick={remove}>
              <Trash2 size={14} />
              删除
            </button>
          )}
        </>
      }
    >
      <Field label="名称">
        <input className="ipt" value={name} onChange={(e) => setName(e.target.value)} placeholder="结婚纪念日 / 离职 / 生日" />
      </Field>

      <Field label="选个图标">
        <div className="icon-picker">
          {COUNTER_ICONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={icon === key ? 'on' : ''}
              title={label}
              aria-label={label}
              onClick={() => setIcon(key)}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </Field>

      <Field label={mode === 'since' ? '从哪天开始' : '目标日期'}>
        <input className="ipt" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
      </Field>

      <Field label="怎么数">
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            type="button"
            className={`pill ${mode === 'since' ? 'accent' : ''}`}
            style={{ cursor: 'pointer', border: 0 }}
            onClick={() => setMode('since')}
          >
            已经过（第 N 天）
          </button>
          <button
            type="button"
            className={`pill ${mode === 'until' ? 'accent' : ''}`}
            style={{ cursor: 'pointer', border: 0 }}
            onClick={() => setMode('until')}
          >
            倒计时（还有 N 天）
          </button>
        </div>
      </Field>

      <Field label="每年循环">
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            type="button"
            className={`pill ${repeat === 'none' ? 'accent' : ''}`}
            style={{ cursor: 'pointer', border: 0 }}
            onClick={() => setRepeat('none')}
          >
            只算一次
          </button>
          <button
            type="button"
            className={`pill ${repeat === 'yearly' ? 'accent' : ''}`}
            style={{ cursor: 'pointer', border: 0 }}
            onClick={() => setRepeat('yearly')}
          >
            每年一次（算周年）
          </button>
        </div>
        <div className="faint small" style={{ marginTop: 6 }}>
          {repeat === 'yearly'
            ? '生日、结婚纪念日选这个 —— 会额外算出第几周年和距离下一个还有几天'
            : '离职第 N 天、连续做某件事第 N 天选这个'}
        </div>
      </Field>

      <Field label="备注（可选）">
        <input className="ipt" value={note} onChange={(e) => setNote(e.target.value)} placeholder="想记的一句话" />
      </Field>
    </Sheet>
  );
}
