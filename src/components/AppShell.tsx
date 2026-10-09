'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe, useTheme } from './Providers';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: '/', label: '今日', icon: '☀️' },
  { href: '/tasks', label: '待办', icon: '✅' },
  { href: '/habits', label: '打卡', icon: '🔥' },
  { href: '/finance', label: '财务', icon: '💰' },
  { href: '/timeline', label: '时间轴', icon: '🧭' },
  { href: '/stats', label: '统计', icon: '📈' },
  { href: '/settings', label: '设置', icon: '⚙️' },
];

const MOBILE_MAIN = ['/', '/tasks', '/habits', '/finance'];

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, streak } = useMe();
  const { theme, toggle } = useTheme();
  const [more, setMore] = useState(false);

  if (!user) {
    return <div className="main">{children}</div>;
  }

  const current = [...NAV].sort((a, b) => b.href.length - a.href.length).find((n) => pathname.startsWith(n.href) && n.href !== '/');
  const currentItem = current ?? NAV[0];
  const activeHref = current?.href ?? '/';
  const rest = NAV.filter((n) => !MOBILE_MAIN.includes(n.href));

  return (
    <div className="app">
      <aside className="side-nav">
        <div className="brand">
          <span className="logo" style={{ width: 24, height: 24, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),var(--purple))', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13 }}>
            ✳
          </span>
          LifeLog
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`side-link ${activeHref === n.href ? 'on' : ''}`}>
            <span>{n.icon}</span>
            {n.label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <div className="small faint" style={{ padding: '0 12px 8px' }}>
          已连续记录 <b style={{ color: 'var(--green)' }}>{streak}</b> 天
        </div>
      </aside>

      <div className="app-col">
        <header className="topbar">
          <div className="brand">
            <span className="logo">✳</span>
            {title ?? 'LifeLog'}
          </div>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={toggle} title="切换主题">
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <Link href="/settings" className="row" style={{ gap: 6, color: 'inherit' }}>
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" width={26} height={26} style={{ borderRadius: '50%' }} />
            ) : (
              <span className="pill">{user.name || user.username}</span>
            )}
          </Link>
        </header>

        <main className="main with-nav">
          <div className="wrap">{children}</div>
        </main>

        <nav className="nav">
          {NAV.filter((n) => MOBILE_MAIN.includes(n.href)).map((n) => (
            <button key={n.href} className={activeHref === n.href ? 'on' : ''} onClick={() => router.push(n.href)}>
              <span className="ic">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <button className={rest.some((r) => r.href === activeHref) ? 'on' : ''} onClick={() => setMore(true)}>
            <span className="ic">⋯</span>
            更多
          </button>
        </nav>
      </div>

      {more && (
        <div className="sheet-mask" onClick={() => setMore(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <h3>全部功能</h3>
              <span className="grow" />
              <button className="btn ghost sm" onClick={() => setMore(false)}>
                关闭
              </button>
            </div>
            {rest.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMore(false)}
                className="row"
                style={{ padding: '13px 4px', borderBottom: '1px solid var(--line)', color: 'inherit' }}
              >
                <span style={{ fontSize: 18 }}>{n.icon}</span>
                <span className="grow">{n.label}</span>
                <span className="faint">›</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
