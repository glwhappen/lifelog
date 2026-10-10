'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useToast } from '@/components/Providers';
import { call, callGet, money, moneyShort, todayLocal } from '@/lib/client';
import { ChartLine, Receipt, TrendingDown, TrendingUp } from '@/components/icons';

interface Group {
  key: string;
  expense: number;
  income: number;
  count: number;
}
interface Summary {
  from: string;
  to: string;
  expense: number;
  income: number;
  net: number;
  byCategory: Group[];
  byDay: Array<{ day: string; expense: number; income: number }>;
  byMonth: Array<{ month: string; expense: number; income: number }>;
  topExpenses: Array<{ id: number; day: string; title: string | null; content: string | null; amount: number; category: string | null }>;
}
interface Entry {
  id: number;
  kind: string;
  day: string;
  title: string | null;
  content: string | null;
  amount: number | null;
  category: string | null;
}

const RANGES = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '近 30 天' },
  { key: 'year', label: '近一年' },
];

export default function FinancePage() {
  return (
    <AppShell title="财务">
      <Gate>
        <Finance />
      </Gate>
    </AppShell>
  );
}

function Finance() {
  const { show } = useToast();
  const [range, setRange] = useState('month');
  const [sum, setSum] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: 'expense', amount: '', category: '', note: '', day: todayLocal() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        callGet<Summary>('finance_summary', { range }),
        callGet<{ entries: Entry[] }>('query_entries', { kind: 'expense,income', days: 14, limit: 40 }),
      ]);
      setSum(s);
      setRecent(r.entries);
    } catch (e: any) {
      show(e.error || '加载失败', 'err');
    } finally {
      setLoading(false);
    }
  }, [range, show]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      show('请输入有效金额', 'err');
      return;
    }
    setBusy(true);
    try {
      await call(form.kind === 'expense' ? 'log_expense' : 'log_income', {
        amount,
        category: form.category || undefined,
        note: form.note || undefined,
        day: form.day,
      });
      setForm((f) => ({ ...f, amount: '', note: '' }));
      show(form.kind === 'expense' ? '已记支出' : '已记收入');
      await load();
    } catch (e: any) {
      show(e.error || '记录失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const maxExpense = Math.max(1, ...(sum?.byCategory.map((c) => c.expense) ?? [1]));
  const maxDaily = Math.max(1, ...(sum?.byDay.map((d) => d.expense) ?? [1]));

  return (
    <>
      <div className="card tight">
        <div className="row wrap" style={{ gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r.key} className={`pill ${range === r.key ? 'accent' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            <Receipt size={16} /> 记一笔
          </h2>
          <span className="grow" />
          <div className="row" style={{ gap: 4 }}>
            <button className={`pill ${form.kind === 'expense' ? 'red' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setForm((f) => ({ ...f, kind: 'expense' }))}>
              支出
            </button>
            <button className={`pill ${form.kind === 'income' ? 'green' : ''}`} style={{ cursor: 'pointer', border: 0 }} onClick={() => setForm((f) => ({ ...f, kind: 'income' }))}>
              收入
            </button>
          </div>
        </div>
        <div className="row wrap">
          <input
            className="ipt mono"
            inputMode="decimal"
            placeholder="金额"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            style={{ width: 110 }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <input className="ipt" placeholder="分类" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ width: 130 }} list="cat-hints" />
          <datalist id="cat-hints">
            {(sum?.byCategory ?? []).map((c) => (
              <option key={c.key} value={c.key} />
            ))}
          </datalist>
          <input className="ipt grow" placeholder="备注" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} style={{ minWidth: 120 }} />
          <input className="ipt" type="date" value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} style={{ width: 148 }} />
          <button className="btn primary" disabled={busy} onClick={submit}>
            记下
          </button>
        </div>
      </div>

      {loading || !sum ? (
        <div className="card">
          <div className="empty">加载中…</div>
        </div>
      ) : (
        <>
          <div className="grid3" style={{ marginBottom: 12 }}>
            <div className="stat">
              <div className="k">支出</div>
              <div className="v money out" style={{ fontSize: 17 }} title={money(sum.expense)}>
                {moneyShort(sum.expense)}
              </div>
            </div>
            <div className="stat">
              <div className="k">收入</div>
              <div className="v money in" style={{ fontSize: 17 }} title={money(sum.income)}>
                {moneyShort(sum.income)}
              </div>
            </div>
            <div className="stat">
              <div className="k">净额</div>
              <div className="v" style={{ fontSize: 17, color: sum.net === 0 ? 'var(--fg)' : sum.net > 0 ? 'var(--green)' : 'var(--red)' }} title={money(sum.net)}>
                {moneyShort(sum.net)}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>
              <ChartLine size={16} /> 支出分类
            </h2>
              <span className="grow" />
              <span className="sub">{sum.from} ~ {sum.to}</span>
            </div>
            {sum.byCategory.filter((c) => c.expense > 0).length === 0 ? (
              <div className="empty">这段时间还没有支出</div>
            ) : (
              sum.byCategory
                .filter((c) => c.expense > 0)
                .map((c) => (
                  <div key={c.key} style={{ marginBottom: 9 }}>
                    <div className="row small">
                      <span className="grow">{c.key}</span>
                      <span className="mono">{money(c.expense)}</span>
                      <span className="faint" style={{ width: 42, textAlign: 'right' }}>
                        {((c.expense / sum.expense) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-sub)', borderRadius: 999, marginTop: 4 }}>
                      <div style={{ height: '100%', width: `${(c.expense / maxExpense) * 100}%`, background: 'var(--accent)', borderRadius: 999 }} />
                    </div>
                  </div>
                ))
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>
                <TrendingDown size={16} /> 逐日趋势
              </h2>
            </div>
            {sum.expense + sum.income > 0 && (
            <div className="bars">
              {sum.byDay.slice(-60).map((d) => (
                <div
                  key={d.day}
                  className="b"
                  style={{ height: `${(d.expense / maxDaily) * 100}%`, minHeight: d.expense > 0 ? 3 : 0 }}
                  title={`${d.day} 支出 ${money(d.expense)}`}
                />
              ))}
            </div>
            )}
            {sum.expense + sum.income === 0 && <div className="empty">这段时间还没有收支</div>}
            <div className="row faint small" style={{ marginTop: 6 }}>
              <span>{sum.byDay[0]?.day}</span>
              <span className="grow" />
              <span>{sum.byDay[sum.byDay.length - 1]?.day}</span>
            </div>
          </div>

          {sum.topExpenses.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>
                <TrendingUp size={16} /> 最大支出
              </h2>
              </div>
              {sum.topExpenses.map((e) => (
                <div className="item" key={e.id}>
                  <span className="time">{e.day.slice(5)}</span>
                  <div className="body">
                    <div className="title">{e.title || e.content || '支出'}</div>
                    <div className="meta">{e.category || '未分类'}</div>
                  </div>
                  <span className="money out">{money(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="card">
        <div className="card-head">
          <h2>
            <Receipt size={16} /> 最近流水
          </h2>
        </div>
        {recent.length === 0 ? (
          <div className="empty">最近 14 天没有收支记录</div>
        ) : (
          recent.map((e) => (
            <div className="item" key={e.id}>
              <span className="time">{e.day.slice(5)}</span>
              <div className="body">
                <div className="title">{e.title || e.content || (e.kind === 'expense' ? '支出' : '收入')}</div>
                <div className="meta">{e.category || '未分类'}</div>
              </div>
              <span className={`money ${e.kind === 'expense' ? 'out' : 'in'}`}>
                {e.kind === 'expense' ? '-' : '+'}
                {money(e.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
