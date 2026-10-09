import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="app">
      <main className="main" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="card" style={{ maxWidth: 400, textAlign: 'center', padding: '28px 20px' }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🧭</div>
          <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>这个页面不存在</h2>
          <p className="muted small" style={{ margin: '0 0 16px' }}>
            链接可能写错了，或者这个功能还没做。
          </p>
          <Link className="btn primary" href="/">
            回今日
          </Link>
        </div>
      </main>
    </div>
  );
}
