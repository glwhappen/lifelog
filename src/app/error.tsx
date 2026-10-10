'use client';

import { RefreshCw, TriangleAlert } from '@/components/icons';

/** 页面级错误边界：某个页面渲染炸了也不会整站白屏 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="app">
      <main className="main" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: '28px 20px' }}>
          <div className="row" style={{ justifyContent: 'center', color: 'var(--amber)', marginBottom: 10 }}>
            <TriangleAlert size={30} />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>这个页面出了点问题</h2>
          <p className="muted small" style={{ margin: '0 0 16px' }}>
            数据没有丢。可以重试一下，或者回今日页。
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary row" style={{ gap: 5 }} onClick={reset}>
              <RefreshCw size={15} />
              重试
            </button>
            <a className="btn" href="/">
              回今日
            </a>
          </div>
          {error?.digest && (
            <p className="faint small" style={{ marginTop: 14 }}>
              错误编号 {error.digest}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
