'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useMe, useToast } from '@/components/Providers';
import { callGet, call, todayLocal } from '@/lib/client';
import { TaskEditor, type EditableTask } from '@/components/TaskEditor';

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

const STATES: Array<{ key: string; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'pending', label: '未完成' },
  { key: 'overdue', label: '逾期' },
  { key: 'done', label: '已完成' },
  { key: 'all', label: '全部' },
];

export default function TasksPage() {
  return (
    <AppShell title="待办">
      <Gate>
        <Tasks />
      </Gate>
    </AppShell>
  );
}

function Tasks() {
  const { show } = useToast();
  const { reload: reloadMe } = useMe();
  const [state, setState] = useState('pending');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [edit, setEdit] = useState<EditableTask | null>(null);
  const [title, setTitle] = useState('');
  const [planned, setPlanned] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await callGet<{ tasks: Task[] }>('list_tasks', { state, limit: 300 });
      setTasks(r.tasks);
    } catch (e: any) {
      show(e.error || '加载失败', 'err');
    } finally {
      setLoading(false);
    }
  }, [state, show]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
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

  const add = () =>
    run(async () => {
      await call('add_task', { title: title.trim(), planned_day: planned });
      setTitle('');
    }, '已添加');

  return (
    <>
      <div className="card tight">
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          {STATES.map((s) => (
            <button key={s.key} className={`pill ${state === s.key ? 'accent' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setState(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="row">
          <input
            className="ipt"
            placeholder="新的待办…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && title.trim() && add()}
          />
          <input className="ipt" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} style={{ width: 148 }} />
          <button className="btn primary" disabled={busy || !title.trim()} onClick={add}>
            添加
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty">加载中…</div>
        ) : tasks.length === 0 ? (
          <div className="empty">这里空空如也</div>
        ) : (
          tasks.map((t) => (
            <div className={`item ${t.status === 'done' ? 'done-item' : ''}`} key={t.id}>
              {t.status === 'done' ? (
                <button
                  className="check on"
                  disabled={busy}
                  title="恢复为待办"
                  onClick={() => run(() => call('update_task', { task: t.id, status: 'pending' }), '已恢复')}
                >
                  ✓
                </button>
              ) : (
                <button className="check" disabled={busy} onClick={() => run(() => call('complete_task', { task: t.id }), '已完成')}>
                  ✓
                </button>
              )}
              <div className="body">
                <div className="title">
                  {t.priority >= 2 && <span className="pill red" style={{ marginRight: 6 }}>紧急</span>}
                  {t.priority === 1 && <span className="pill amber" style={{ marginRight: 6 }}>重要</span>}
                  {t.title}
                </div>
                <div className="meta">
                  {t.status === 'done'
                    ? `完成于 ${(t.done_at || '').slice(0, 10)}`
                    : t.planned_day
                      ? `计划 ${t.planned_day}`
                      : '收集箱'}
                  {t.due_day ? ` · 截止 ${t.due_day}` : ''}
                  {t.tags?.length ? ` · ${t.tags.map((x) => `#${x}`).join(' ')}` : ''}
                </div>
              </div>
              <div className="row" style={{ gap: 2 }}>
                {t.status !== 'done' && (
                  <button className="btn ghost sm" disabled={busy} onClick={() => run(() => call('postpone_task', { task: t.id }), '已顺延')}>
                    顺延
                  </button>
                )}
                <button className="btn ghost sm" disabled={busy} title="编辑" onClick={() => setEdit(t)}>
                  ✏️
                </button>
                <button
                  className="btn ghost sm danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`删除待办「${t.title}」？`)) run(() => call('delete_task', { task: t.id }), '已删除');
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <TaskEditor task={edit} onClose={() => setEdit(null)} onChanged={load} />
    </>
  );
}
