'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Gate } from '@/components/Gate';
import { useMe, useTheme, useToast } from '@/components/Providers';
import { callGet, call } from '@/lib/client';
import { Bot, Copy, Download, ExternalLink, FileJson, KeyRound, LogOut, Moon, ShieldCheck, Sun, Trash2, User } from '@/components/icons';

interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export default function SettingsPage() {
  return (
    <AppShell title="设置">
      <Gate>
        <Settings />
      </Gate>
    </AppShell>
  );
}

function Settings() {
  const { user, streak, reload } = useMe();
  const { theme, toggle } = useTheme();
  const { show } = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState({ read: true, write: true });
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  const loadKeys = useCallback(async () => {
    try {
      const r = await fetch('/api/keys', { cache: 'no-store' }).then((x) => x.json());
      if (r?.ok) setKeys(r.keys);
    } catch {
      /* 未登录时忽略 */
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    loadKeys();
  }, [loadKeys]);

  const createKey = async () => {
    const scopes = [keyScopes.read && 'read', keyScopes.write && 'write'].filter(Boolean) as string[];
    if (!scopes.length) {
      show('至少选一个权限', 'err');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName || 'default', scopes }),
      }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.error || '签发失败');
      setNewKey(r.key);
      setKeyName('');
      await loadKeys();
      show('已签发，请立刻复制保存');
    } catch (e: any) {
      show(e.message || '签发失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm('吊销这个 API Key？使用它的 AI 客户端会立刻失效。')) return;
    setBusy(true);
    try {
      await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
      await loadKeys();
      show('已吊销');
    } finally {
      setBusy(false);
    }
  };

  const mcpUrl = `${origin}/api/mcp`;
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        lifelog: {
          type: 'http',
          url: mcpUrl,
          headers: { Authorization: 'Bearer ll-你的密钥' },
        },
      },
    },
    null,
    2,
  );

  const timezones = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'Europe/London'];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>
            <User size={16} /> 账号
          </h2>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" width={44} height={44} style={{ borderRadius: '50%' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
              <User size={22} />
            </div>
          )}
          <div className="body">
            <div style={{ fontWeight: 600 }}>{user?.name || user?.username}</div>
            <div className="faint small mono">{user?.sub}</div>
          </div>
          <span className="pill green">连续记录 {streak} 天</span>
        </div>
        <div className="row wrap">
          <span className="small muted">时区</span>
          <select
            className="ipt"
            style={{ width: 190 }}
            value={user?.timezone || 'Asia/Shanghai'}
            onChange={async (e) => {
              await fetch('/api/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: e.target.value }),
              });
              await reload();
              show('时区已更新');
            }}
          >
            {timezones.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="grow" />
          <button className="btn sm row" style={{ gap: 5 }} onClick={toggle}>
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {theme === 'dark' ? '暗色' : '亮色'}
          </button>
          <button className="btn sm row" style={{ gap: 5 }} onClick={() => (window.location.href = '/auth/logout')}>
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            <Bot size={16} /> AI 接入（MCP）
          </h2>
          <span className="grow" />
          <a className="btn sm row" style={{ gap: 5 }} href="/api/v1/tools" target="_blank" rel="noreferrer">
            <ExternalLink size={13} />
            查看全部能力
          </a>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          任何支持 MCP 的客户端（Claude Desktop / Cursor / pi / OpenClaw…）填下面这个地址 + 一个 API Key，就能读取和记录你的生活数据。
        </p>
        <div className="row" style={{ marginBottom: 8 }}>
          <input className="ipt mono small" readOnly value={mcpUrl} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn icon-btn" title="复制" aria-label="复制" onClick={() => navigator.clipboard.writeText(mcpUrl).then(() => show('已复制'))}>
            <Copy size={15} />
          </button>
        </div>
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>
            客户端配置示例（stdio 之外统一走 HTTP）
          </summary>
          <pre className="small mono" style={{ background: 'var(--bg-sub)', padding: 10, borderRadius: 10, overflowX: 'auto' }}>
            {mcpConfig}
          </pre>
        </details>
        <details style={{ marginTop: 6 }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>
            用 curl 试一下
          </summary>
          <pre className="small mono" style={{ background: 'var(--bg-sub)', padding: 10, borderRadius: 10, overflowX: 'auto' }}>
{`curl -s ${origin}/api/v1/get_day \\
  -H "Authorization: Bearer ll-你的密钥"`}
          </pre>
        </details>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            <KeyRound size={16} /> API Key
          </h2>
        </div>

        {newKey && (
          <div className="card" style={{ background: 'var(--green-soft)', borderColor: 'var(--green)', boxShadow: 'none' }}>
            <div className="small" style={{ marginBottom: 6 }}>
              <span className="row" style={{ gap: 6 }}>
                <ShieldCheck size={15} />
                <span>
                  新密钥已生成，<b>只显示这一次</b>，请立刻保存：
                </span>
              </span>
            </div>
            <div className="row">
              <input className="ipt mono small" readOnly value={newKey} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn primary icon-btn" title="复制" aria-label="复制" onClick={() => navigator.clipboard.writeText(newKey).then(() => show('已复制'))}>
                <Copy size={15} />
              </button>
            </div>
            <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setNewKey(null)}>
              我已保存，关闭
            </button>
          </div>
        )}

        <div className="row wrap" style={{ marginBottom: 10 }}>
          <input className="ipt" placeholder="名称，如 Claude" value={keyName} onChange={(e) => setKeyName(e.target.value)} style={{ width: 150 }} />
          <label className="row small" style={{ gap: 4 }}>
            <input type="checkbox" checked={keyScopes.read} onChange={(e) => setKeyScopes((s) => ({ ...s, read: e.target.checked }))} /> 读
          </label>
          <label className="row small" style={{ gap: 4 }}>
            <input type="checkbox" checked={keyScopes.write} onChange={(e) => setKeyScopes((s) => ({ ...s, write: e.target.checked }))} /> 写
          </label>
          <button className="btn primary sm" disabled={busy} onClick={createKey}>
            签发新 Key
          </button>
        </div>

        {keys.length === 0 ? (
          <div className="empty">还没有密钥</div>
        ) : (
          keys.map((k) => (
            <div className="item" key={k.id} style={{ opacity: k.revoked_at ? 0.5 : 1 }}>
              <div className="body">
                <div className="title">
                  {k.name} <span className="mono faint small">{k.prefix}…</span>
                  {k.revoked_at && <span className="pill red" style={{ marginLeft: 6 }}>已吊销</span>}
                </div>
                <div className="meta">
                  {k.scopes.join(' / ')} · 最近使用 {k.last_used_at ? k.last_used_at.slice(0, 16).replace('T', ' ') : '从未'}
                </div>
              </div>
              {!k.revoked_at && (
                <button className="btn ghost icon-btn danger" disabled={busy} title="吊销" aria-label="吊销" onClick={() => revoke(k.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            <Download size={16} /> 导出
          </h2>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          导出为 Markdown（可以直接喂给大模型，或存进你的笔记库）。
        </p>
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {[
            ['7', '近 7 天'],
            ['30', '近 30 天'],
            ['365', '近一年'],
          ].map(([d, label]) => (
            <a key={d} className="btn sm" href={`/api/v1/daily_digest?days=${d}&max_days=${d}&format=markdown`} target="_blank" rel="noreferrer">
              摘要{label}
            </a>
          ))}
        </div>

        <p className="small muted" style={{ margin: '0 0 8px' }}>
          想整包带走？导出<b>全部原始数据</b>（JSON，表结构原样），随时可迁走或自己分析。
        </p>
        <div className="row wrap">
          <a className="btn sm row" style={{ gap: 5 }} href="/api/export" download>
            <FileJson size={14} />
            全部数据（JSON）
          </a>
          <a className="btn sm row" style={{ gap: 5 }} href="/api/export?days=365" download>
            <FileJson size={14} />
            近一年（JSON）
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            <ShieldCheck size={16} /> 关于
          </h2>
        </div>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.8 }}>
          LifeLog · 自托管个人生活记录平台。数据全部存在你自己的 Postgres 里，登录走你自己的 OIDC。
          <br />
          开源地址：待发布（MIT License）。
        </p>
      </div>
    </>
  );
}
