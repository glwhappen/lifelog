'use client';

import { useEffect, useState } from 'react';
import { Sheet, Field } from './Sheet';
import { useToast } from './Providers';
import { call } from '@/lib/client';

export interface EditableTask {
  id: number;
  title: string;
  note: string | null;
  status: string;
  priority: number;
  planned_day: string | null;
  due_day: string | null;
  tags: string[];
}

const PRIORITY = [
  { v: 0, label: '普通' },
  { v: 1, label: '重要' },
  { v: 2, label: '紧急' },
];

/** 待办编辑弹层：改标题/备注/优先级/计划日/截止日/标签，或删除 */
export function TaskEditor({
  task,
  onClose,
  onChanged,
}: {
  task: EditableTask | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { show } = useToast();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState(0);
  const [planned, setPlanned] = useState('');
  const [due, setDue] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNote(task.note ?? '');
    setPriority(task.priority ?? 0);
    setPlanned(task.planned_day ?? '');
    setDue(task.due_day ?? '');
    setTags((task.tags ?? []).join(', '));
  }, [task]);

  if (!task) return null;

  const save = async () => {
    if (!title.trim()) {
      show('标题不能为空', 'err');
      return;
    }
    setBusy(true);
    try {
      await call('update_task', {
        task: task.id,
        title: title.trim(),
        note: note.trim() || null,
        priority,
        planned_day: planned || null,
        due_day: due || null,
        tags: tags
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      show('已保存');
      await onChanged();
      onClose();
    } catch (e: any) {
      show(e.error || '保存失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`删除待办「${task.title}」？`)) return;
    setBusy(true);
    try {
      await call('delete_task', { task: task.id });
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
      title="编辑待办"
      onClose={onClose}
      footer={
        <>
          <button className="btn primary grow" disabled={busy} onClick={save}>
            保存
          </button>
          <button className="btn danger" disabled={busy} onClick={remove}>
            删除
          </button>
        </>
      }
    >
      <Field label="标题">
        <input className="ipt" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="备注">
        <textarea className="ipt" value={note} onChange={(e) => setNote(e.target.value)} placeholder="补充说明…" style={{ minHeight: 60 }} />
      </Field>

      <Field label="优先级">
        <div className="row" style={{ gap: 6 }}>
          {PRIORITY.map((p) => (
            <button
              key={p.v}
              type="button"
              className={`pill ${priority === p.v ? (p.v === 2 ? 'red' : p.v === 1 ? 'amber' : 'accent') : ''}`}
              style={{ cursor: 'pointer', border: 0 }}
              onClick={() => setPriority(p.v)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Field label="计划日（空 = 收集箱）">
            <input className="ipt" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="截止日">
            <input className="ipt" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="标签（逗号分隔）">
        <input className="ipt" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="工作, 生活" />
      </Field>
    </Sheet>
  );
}
