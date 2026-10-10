'use client';

/** 兜底错误边界：连根布局都渲染失败时使用（必须自带 html/body） */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f6f7f9', color: '#1b1f24' }}>
        <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 380 }}>

            <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>服务暂时不可用</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 18px' }}>
              数据存在你自己的数据库里，不会丢。请稍后重试。
            </p>
            <button
              onClick={reset}
              style={{ background: '#2f6bff', color: '#fff', border: 0, borderRadius: 10, padding: '9px 18px', fontSize: 14, cursor: 'pointer' }}
            >
              重试
            </button>
            {error?.digest && <p style={{ color: '#9aa1ab', fontSize: 12, marginTop: 14 }}>错误编号 {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
