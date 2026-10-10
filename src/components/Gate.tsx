'use client';

import { useMe } from './Providers';
import { LogIn, Logo } from './icons';

/** 登录闸门：未登录时展示统一登录入口（OIDC） */
export function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMe();

  if (loading) {
    return (
      <div className="card">
        <div className="empty">加载中…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: 'linear-gradient(135deg, var(--accent), var(--purple))',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Logo size={26} />
          </span>
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>LifeLog</h2>
        <p className="muted small" style={{ margin: '0 0 18px' }}>
          记录待办、完成、灵感、习惯、收支、位置与健康，一处沉淀，AI 可读写。
        </p>
        <a className="btn primary row" href="/auth/login" style={{ display: 'inline-flex', gap: 6 }}>
          <LogIn size={16} />
          使用统一登录（SSO）
        </a>
        <p className="faint small" style={{ marginTop: 14 }}>
          第一次登录的账号会自动成为管理员
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
