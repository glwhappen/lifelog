'use client';

import { useEffect, useState } from 'react';
import { Sheet, Field } from './Sheet';
import { useToast } from './Providers';
import { call } from '@/lib/client';
import { kindMeta } from '@/lib/kinds';
import { KindIcon, Trash2 } from './icons';

export interface EditableEntry {
  id: number;
  kind: string;
  day: string;
  title: string | null;
  content: string | null;
  amount: number | null;
  category: string | null;
  tags: string[];
  meta?: any;
}

/**
 * 流水编辑/删除弹层。
 * 之前只能通过 API 或让 AI 改，用户在页面上打错一个字就没有办法——这是最影响手感的缺口。
 */
export function EntryEditor({
  entry,
  onClose,
  onChanged,
}: {
  entry: EditableEntry | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { show } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title ?? '');
    setContent(entry.content ?? '');
    setAmount(entry.amount === null || entry.amount === undefined ? '' : String(entry.amount));
    setCategory(entry.category ?? '');
    setTags((entry.tags ?? []).join(', '));
    setDay(entry.day);
  }, [entry]);

  if (!entry) return null;
  const meta = kindMeta(entry.kind);
  const isMoney = entry.kind === 'expense' || entry.kind === 'income';
  const isNumeric = Boolean(meta.numeric) || isMoney;

  const save = async () => {
    const amt = amount.trim() === '' ? null : Number(amount);
    if (amt !== null && !Number.isFinite(amt)) {
      show('金额要填数字', 'err');
      return;
    }
    setBusy(true);
    try {
      await call('update_entry', {
        id: entry.id,
        title: title.trim() || null,
        content: content.trim() || null,
        amount: amt,
        category: category.trim() || null,
        tags: tags
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        day,
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
    if (!confirm('删除这条记录？删除后不再出现在统计里。')) return;
    setBusy(true);
    try {
      await call('delete_entry', { id: entry.id });
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
      title={`编辑 · ${meta.label}`}
      icon={<KindIcon kind={entry.kind} size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary grow" disabled={busy} onClick={save}>
            保存
          </button>
          <button className="btn danger row" style={{ gap: 5 }} disabled={busy} onClick={remove}>
            <Trash2 size={14} />
            删除
          </button>
        </>
      }
    >
      {(entry.title !== null || isMoney) && (
        <Field label="标题">
          <input className="ipt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句话说明" />
        </Field>
      )}

      <Field label="内容">
        <textarea className="ipt" value={content} onChange={(e) => setContent(e.target.value)} placeholder="补充细节…" />
      </Field>

      {isNumeric && (
        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Field label={isMoney ? '金额' : '数值'}>
              <input
                className="ipt mono"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label={isMoney ? '分类' : '单位'}>
              <input className="ipt" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={isMoney ? '餐饮 / 交通…' : 'kg / 分钟…'} />
            </Field>
          </div>
        </div>
      )}

      <Field label="标签（逗号分隔）">
        <input className="ipt" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="健康, 工作" />
      </Field>

      <Field label="日期">
        <input className="ipt" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </Field>
    </Sheet>
  );
}
