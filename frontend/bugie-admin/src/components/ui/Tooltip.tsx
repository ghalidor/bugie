import { ButtonHTMLAttributes, cloneElement, isValidElement, ReactElement, ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Texto de ayuda. */
  content: ReactNode;
  /** Un solo elemento (boton, icono...). Debe aceptar ref y eventos. */
  children: ReactElement;
  placement?: TooltipPlacement;
  /** Desactiva el tooltip (ej. menu expandido donde ya se ve el texto). */
  disabled?: boolean;
}

const GAP = 8;

/**
 * Burbuja de ayuda al pasar el mouse o enfocar con teclado.
 * Usala en botones de solo icono. Se dibuja en un portal, asi no la
 * recortan tablas ni contenedores con scroll.
 */
export function Tooltip({ content, children, placement = 'top', disabled }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    let top = 0, left = 0;
    let place = placement;
    if (place === 'top' && a.top - t.height - GAP < 4) place = 'bottom';
    if (place === 'right' && a.right + t.width + GAP > window.innerWidth - 4) place = 'left';
    if (place === 'top')    { top = a.top - t.height - GAP; left = a.left + a.width / 2 - t.width / 2; }
    if (place === 'bottom') { top = a.bottom + GAP;          left = a.left + a.width / 2 - t.width / 2; }
    if (place === 'left')   { top = a.top + a.height / 2 - t.height / 2; left = a.left - t.width - GAP; }
    if (place === 'right')  { top = a.top + a.height / 2 - t.height / 2; left = a.right + GAP; }
    left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - t.height - 8));
    setPos({ top, left });
  }, [open, placement, content]);

  if (!isValidElement(children)) return children;
  if (disabled || !content) return children;

  const child = children as ReactElement<any>;
  const show = () => setOpen(true);
  const hide = () => { setOpen(false); setPos(null); };

  return (
    <>
      {cloneElement(child, {
        ref: (node: HTMLElement | null) => {
          anchorRef.current = node;
          const r = (child as any).ref;
          if (typeof r === 'function') r(node); else if (r && typeof r === 'object') r.current = node;
        },
        'aria-describedby': open ? id : child.props['aria-describedby'],
        onMouseEnter: (e: any) => { child.props.onMouseEnter?.(e); show(); },
        onMouseLeave: (e: any) => { child.props.onMouseLeave?.(e); hide(); },
        onFocus: (e: any) => { child.props.onFocus?.(e); show(); },
        onBlur: (e: any) => { child.props.onBlur?.(e); hide(); },
        onKeyDown: (e: any) => { child.props.onKeyDown?.(e); if (e.key === 'Escape') hide(); },
      })}
      {open && createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          className="bx-tooltip"
          style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Clase FontAwesome sin prefijo, ej. 'fa-pen'. */
  icon: string;
  /** Texto accesible y del tooltip (obligatorio: el boton no tiene texto visible). */
  label: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'ghost' | 'danger';
  tooltipPlacement?: TooltipPlacement;
}

/** Boton redondo de solo icono, con tooltip y aria-label. */
export function IconButton({ icon, label, size = 'md', variant = 'default', tooltipPlacement = 'top', className = '', type = 'button', ...rest }: IconButtonProps) {
  const cls = ['bx-icon-btn', size === 'sm' ? 'sm' : '', variant === 'ghost' ? 'ghost' : '', variant === 'danger' ? 'danger' : '', className].filter(Boolean).join(' ');
  return (
    <Tooltip content={label} placement={tooltipPlacement}>
      <button type={type} className={cls} aria-label={label} {...rest}>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
