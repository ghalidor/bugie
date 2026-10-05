import { KeyboardEvent, ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface TabItem {
  value: string;
  label: ReactNode;
  /** Clase FontAwesome sin prefijo. */
  icon?: string;
  /** Contador pequeño (ej. pendientes). */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Modo controlado. Si no se pasa, la pestaña vive en la URL (?tab=...). */
  value?: string;
  onChange?: (value: string) => void;
  /** Nombre del parametro de URL en modo URL. Por defecto 'tab'. */
  param?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Lee/escribe la pestaña activa en la URL (?tab=...). Usalo en la pagina
 * para saber que contenido mostrar:
 *   const [tab, setTab] = useTabParam(['resumen', 'detalle']);
 */
export function useTabParam(values: string[], param = 'tab'): [string, (v: string) => void] {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get(param);
  const value = raw && values.includes(raw) ? raw : values[0];
  const set = useCallback((v: string) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      if (v === values[0]) next.delete(param); else next.set(param, v);
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSp, param, values.join('|')]);
  return [value, set];
}

/**
 * Pestañas con indicador deslizante. En movil se desplazan en horizontal.
 * Solo dibuja la barra: el contenido lo pinta la pagina segun el valor.
 */
export function Tabs({ items, value, onChange, param = 'tab', ariaLabel = 'Secciones', className = '' }: TabsProps) {
  const [urlValue, setUrlValue] = useTabParam(items.map(i => i.value), param);
  const controlled = value !== undefined;
  const active = controlled ? value : urlValue;
  const select = (v: string) => {
    if (!controlled) setUrlValue(v);
    onChange?.(v);
  };

  const listRef = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!el) { setInk(null); return; }
      setInk({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const el = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && list.scrollWidth > list.clientWidth) {
      const target = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
      list.scrollTo({ left: Math.max(0, target) });
    }
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [active, items.length]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const enabled = items.filter(i => !i.disabled);
    const idx = enabled.findIndex(i => i.value === active);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = enabled.length - 1;
    const v = enabled[next]?.value;
    if (v) {
      select(v);
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(v)}"]`)?.focus());
    }
  };

  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className={`bx-tabs ${className}`} onKeyDown={onKey}>
      {items.map(it => {
        const selected = it.value === active;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            data-value={it.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={it.disabled}
            className="bx-tab"
            onClick={() => select(it.value)}
          >
            {it.icon && <i className={`fa-solid ${it.icon}`} aria-hidden="true" />}
            <span>{it.label}</span>
            {typeof it.count === 'number' && <span className="bx-tab-count">{it.count}</span>}
          </button>
        );
      })}
      {ink && <span className="bx-tabs-ink" aria-hidden="true" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} />}
    </div>
  );
}
