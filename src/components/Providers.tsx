'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ---------------------------------------------------------------- 用户 */

export interface Me {
  sub: string;
  username: string;
  name?: string;
  avatar?: string;
  timezone: string;
  isAdmin?: boolean;
}

export interface MeState {
  user: Me | null;
  loading: boolean;
  streak: number;
  counts: { planned: number; done: number; overdue: number; inbox: number };
  reload: () => Promise<void>;
}

const MeCtx = createContext<MeState>({
  user: null,
  loading: true,
  streak: 0,
  counts: { planned: 0, done: 0, overdue: 0, inbox: 0 },
  reload: async () => {},
});

export const useMe = () => useContext(MeCtx);

/* ---------------------------------------------------------------- 主题 */

type Theme = 'light' | 'dark';
interface ThemeState {
  theme: Theme;
  toggle: () => void;
}
const ThemeCtx = createContext<ThemeState>({ theme: 'light', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

/* ---------------------------------------------------------------- 轻提示 */

interface ToastState {
  show: (msg: string, kind?: 'ok' | 'err') => void;
}
const ToastCtx = createContext<ToastState>({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [counts, setCounts] = useState({ planned: 0, done: 0, overdue: 0, inbox: 0 });
  const [theme, setTheme] = useState<Theme>('light');
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; kind: 'ok' | 'err' }>>([]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      const data = await res.json();
      if (data?.ok) {
        setUser(data.user);
        setStreak(data.streak ?? 0);
        setCounts(data.counts ?? { planned: 0, done: 0, overdue: 0, inbox: 0 });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const saved = localStorage.getItem('lifelog-theme') as Theme | null;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const t: Theme = saved ?? (prefersDark ? 'dark' : 'light');
    setTheme(t);
    document.body.setAttribute('theme-mode', t);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('lifelog-theme', next);
      document.body.setAttribute('theme-mode', next);
      return next;
    });
  }, []);

  const show = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 4200 : 2200);
  }, []);

  const meValue = useMemo<MeState>(() => ({ user, loading, streak, counts, reload }), [user, loading, streak, counts, reload]);
  const themeValue = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  const toastValue = useMemo(() => ({ show }), [show]);

  return (
    <MeCtx.Provider value={meValue}>
      <ThemeCtx.Provider value={themeValue}>
        <ToastCtx.Provider value={toastValue}>
          {children}
          <div className="toast-host">
            {toasts.map((t) => (
              <div key={t.id} className={t.kind === 'err' ? 'toast err' : 'toast'}>
                {t.msg}
              </div>
            ))}
          </div>
        </ToastCtx.Provider>
      </ThemeCtx.Provider>
    </MeCtx.Provider>
  );
}
