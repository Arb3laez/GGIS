import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { QuoteWarning } from '@ggis/domain';
import { ApiError } from '../api/http';

type Toast = { id: number; text: string; error: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});

/** Notificaciones breves (reemplazan los alert() de la versión anterior). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6_000 : 3_000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite">
        {toasts.map((t, i) => (
          <div
            key={t.id}
            className={`toast${t.error ? ' error' : ''}`}
            style={{ bottom: 18 + i * 56 }}
            role="status"
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado.';
}

export function Alerts({ items }: { items: QuoteWarning[] }) {
  return (
    <>
      {items.map((w) => (
        <div key={w.code} className={`alert ${w.level}`} role={w.level === 'danger' ? 'alert' : undefined}>
          {w.level === 'danger' ? '⚠ ' : w.level === 'ok' ? '✓ ' : ''}
          {w.message}
        </div>
      ))}
    </>
  );
}
