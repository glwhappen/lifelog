'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe, useTheme } from './Providers';
import { Logo, Moon, Sun, Ellipsis, X, History, ChartLine, Settings, CalendarCheck, ListChecks, Flame, Wallet } from './icons';

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const NAV: NavItem[] = [
  { href: '/', label: '今日', Icon: CalendarCheck },
  { href: '/tasks', label: '待办', Icon: ListChecks },
  { href: '/habits', label: '打卡', Icon: Flame },
  { href: '/finance', label: '财务', Icon: Wallet },
  { href: '/timeline', label: '时间轴', Icon: History },
  { href: '/stats', label: '统计', Icon: ChartLine },
  { href: '/settings', label: '设置', Icon: Settings },
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
  const activeHref = currentItem.href;
  const rest = NAV.filter((n) => !MOBILE_MAIN.includes(n.href));
  const CurrentIcon = currentItem.Icon;

  return (
    <div className="app">
      <aside className="side-nav">
        <div className="brand">
          <span className="logo">
            <Logo size={15} />
          </span>
          LifeLog
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`side-link ${activeHref === n.href ? 'on' : ''}`}>
            <n.Icon size={17} strokeWidth={2} />
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
            {/* 手机（无侧栏）显示品牌标记；桌面显示当前页面图标 */}
            <span className="logo brand-logo">
              <Logo size={15} />
            </span>
            <span className="page-ic">
              <CurrentIcon size={15} strokeWidth={2} />
            </span>
            {title ?? currentItem.label}
          </div>
          <div className="spacer" />
          <button className="btn ghost icon-btn" onClick={toggle} title="切换主题" aria-label="切换主题">
            {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
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
              <span className="ic">
                <n.Icon size={20} strokeWidth={activeHref === n.href ? 2.3 : 1.9} />
              </span>
              {n.label}
            </button>
          ))}
          <button className={rest.some((r) => r.href === activeHref) ? 'on' : ''} onClick={() => setMore(true)}>
            <span className="ic">
              <Ellipsis size={20} strokeWidth={2} />
            </span>
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
              <button className="btn ghost icon-btn" onClick={() => setMore(false)} aria-label="关闭">
                <X size={17} />
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
                <n.Icon size={18} strokeWidth={2} />
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
