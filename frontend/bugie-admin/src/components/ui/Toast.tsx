import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  tone?: ToastTone;
  title?: string;
  message: string;
  /** ms antes de cerrarse solo. 0 = no se cierra solo. Por defecto 4000 (errores 6500). */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'title'>> { id: number; title?: string; leaving?: boolean }

export interface ToastApi {
  show: (opts: ToastOptions) => number;
  success: (message: string, title?: string) => number;
  error: (message: string, title?: string) => number;
  info: (message: string, title?: string) => number;
  warning: (message: string, title?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { cls: string; icon: string; title: string }> = {
  success: { cls: 'bx-tone-ok',   icon: 'fa-circle-check',         title: 'Listo' },
  error:   { cls: 'bx-tone-bad',  icon: 'fa-circle-exclamation',   title: 'Algo salió mal' },
  info:    { cls: 'bx-tone-info', icon: 'fa-circle-info',          title: 'Aviso' },
  warning: { cls: 'bx-tone-warn', icon: 'fa-triangle-exclamation', title: 'Atención' },
};

let seq = 0;

/** Monta una vez en la raiz. Luego usa useToast() en cualquier componente. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setItems(list => list.map(t => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 200);
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const show = useCallback((opts: ToastOptions) => {
    const id = ++seq;
    const tone = opts.tone ?? 'info';
    const duration = opts.duration ?? (tone === 'error' ? 6500 : 4000);
    setItems(list => [...list.slice(-3), { id, tone, title: opts.title, message: opts.message, duration }]);
    if (duration > 0) timers.current.set(id, setTimeout(() => remove(id), duration));
    return id;
  }, [remove]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (message, title) => show({ tone: 'success', message, title }),
    error:   (message, title) => show({ tone: 'error', message, title }),
    info:    (message, title) => show({ tone: 'info', message, title }),
    warning: (message, title) => show({ tone: 'warning', message, title }),
    dismiss: remove,
  }), [show, remove]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="bx-toasts" aria-live="polite" aria-atomic="false">
          {items.map(t => {
            const cfg = TONE[t.tone];
            return (
              <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`bx-toast ${cfg.cls} ${t.leaving ? 'is-leaving' : ''}`}>
                <i className={`fa-solid ${cfg.icon} bx-toast-icon`} aria-hidden="true" />
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="bx-toast-title">{t.title ?? cfg.title}</div>
                  <div className="bx-toast-msg">{t.message}</div>
                </div>
                <button type="button" className="bx-icon-btn sm ghost" onClick={() => remove(t.id)} aria-label="Cerrar aviso">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** Avisos cortos que se cierran solos. Reemplaza a alert(). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() necesita <ToastProvider> en la raíz.');
  return ctx;
}
