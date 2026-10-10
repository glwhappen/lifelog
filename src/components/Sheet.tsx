'use client';

import { useEffect } from 'react';
import { X } from './icons';

/**
 * 通用底部弹层（移动端） / 居中弹窗（桌面）。
 * 手机上从底部推上来，桌面上居中——和原生 App 的手感一致。
 */
export function Sheet({
  open,
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-mask" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h3>
            {icon}
            {title}
          </h3>
          <span className="grow" />
          <button className="btn ghost icon-btn" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        {children}
        {footer && (
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 表单行 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span className="small muted" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
