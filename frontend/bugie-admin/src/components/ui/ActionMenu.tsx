import { KeyboardEvent, ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useClickOutside, useLayer } from './hooks';
import { Tooltip } from './Tooltip';

export interface ActionItem {
  label: string;
  /** Clase FontAwesome sin prefijo, ej. 'fa-pen'. */
  icon?: string;
  onClick?: () => void;
  /** Navega a esta ruta interna en vez de onClick. */
  to?: string;
  /** Acciones destructivas en rojo. */
  danger?: boolean;
  disabled?: boolean;
  /** Linea divisoria antes de este item. */
  separator?: boolean;
  /** Oculta el item sin tener que filtrar el arreglo. */
  hidden?: boolean;
}

export interface ActionMenuProps {
  items: ActionItem[];
  /** Texto accesible del boton. Por defecto "Más acciones". */
  label?: string;
  /** Contenido del boton. Por defecto el icono "⋯". */
  trigger?: ReactNode;
  /** Clase del boton disparador. */
  triggerClassName?: string;
  align?: 'start' | 'end';
}

/** Menu desplegable "⋯" con acciones. Se cierra con Esc, clic fuera o al elegir. */
export function ActionMenu({ items, label = 'Más acciones', trigger, triggerClassName, align = 'end' }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = items.filter(i => !i.hidden);

  const close = () => { setOpen(false); btnRef.current?.focus(); };
  useLayer(open, close);
  useClickOutside([btnRef, listRef], open, () => setOpen(false));

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !listRef.current) return;
    const place = () => {
      if (!btnRef.current || !listRef.current) return;
      const b = btnRef.current.getBoundingClientRect();
      const l = listRef.current.getBoundingClientRect();
      let left = align === 'end' ? b.right - l.width : b.left;
      left = Math.max(8, Math.min(left, window.innerWidth - l.width - 8));
      let top = b.bottom + 6;
      if (top + l.height > window.innerHeight - 8) top = Math.max(8, b.top - l.height - 6);
      setPos({ top, left });
    };
    place();
    listRef.current.querySelector<HTMLElement>('.bx-menu-item:not(:disabled)')?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  if (visible.length === 0) return null;

  const onListKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.bx-menu-item:not(:disabled)') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  const button = (
    <button
      ref={btnRef}
      type="button"
      className={triggerClassName ?? 'bx-icon-btn sm ghost'}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
    >
      {trigger ?? <i className="fa-solid fa-ellipsis" aria-hidden="true" />}
    </button>
  );

  return (
    <span className="bx-menu" onClick={e => e.stopPropagation()}>
      {trigger ? button : <Tooltip content={label} disabled={open}>{button}</Tooltip>}
      {open && createPortal(
        <div
          ref={listRef}
          id={id}
          role="menu"
          className="bx-menu-list"
          style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          onKeyDown={onListKey}
        >
          {visible.map((it, i) => {
            const content = (
              <>
                {it.icon ? <i className={`fa-solid ${it.icon}`} aria-hidden="true" /> : <i aria-hidden="true" />}
                <span>{it.label}</span>
              </>
            );
            const cls = `bx-menu-item ${it.danger ? 'danger' : ''}`;
            return (
              <div key={`${it.label}-${i}`}>
                {it.separator && i > 0 && <div className="bx-menu-sep" role="separator" />}
                {it.to && !it.disabled ? (
                  <Link role="menuitem" to={it.to} className={cls} onClick={() => setOpen(false)}>{content}</Link>
                ) : (
                  <button
                    role="menuitem"
                    type="button"
                    className={cls}
                    disabled={it.disabled}
                    onClick={() => { setOpen(false); it.onClick?.(); }}
                  >
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </span>
  );
}
