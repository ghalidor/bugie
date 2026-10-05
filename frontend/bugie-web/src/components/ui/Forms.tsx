import { ButtonHTMLAttributes, cloneElement, isValidElement, ReactElement, ReactNode, useId } from 'react';

/* ══ Field ═══════════════════════════════════════════════════════════ */

export interface FieldProps {
  label: ReactNode;
  /** Un solo control (input, select, textarea). Recibe id y aria-* automaticamente. */
  children: ReactNode;
  /** Ayuda corta bajo el control (una linea). */
  help?: ReactNode;
  /** Mensaje de error (pinta el control en rojo). */
  error?: ReactNode;
  required?: boolean;
  /** Muestra "(opcional)". */
  optional?: boolean;
  /** id del control; si no se pasa se genera uno. */
  id?: string;
  /** Dentro de FormGrid: 'full' ocupa toda la fila. */
  span?: 'full';
  className?: string;
}

/** Etiqueta + control + ayuda + error, conectados para lectores de pantalla. */
export function Field({ label, children, help, error, required, optional, id, span, className = '' }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const helpId = `${controlId}-help`;
  const errId = `${controlId}-err`;
  const describedBy = [help ? helpId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;

  let control = children;
  if (isValidElement(children)) {
    const el = children as ReactElement<any>;
    control = cloneElement(el, {
      id: el.props.id ?? controlId,
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
      required: el.props.required ?? required,
    });
  }

  return (
    <div className={`bx-field ${error ? 'has-error' : ''} ${span === 'full' ? 'span-all' : ''} ${className}`}>
      <label className="bx-field-label" htmlFor={controlId}>
        {label}
        {required && <span className="bx-field-req" aria-hidden="true">*</span>}
        {optional && <span className="bx-field-opt">(opcional)</span>}
      </label>
      {control}
      {help && !error && <p id={helpId} className="bx-field-help">{help}</p>}
      {error && <p id={errId} className="bx-field-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />{error}</p>}
    </div>
  );
}

/* ══ FormGrid / FormActions ═════════════════════════════════════════ */

/**
 * Grilla de formulario: 1 columna en movil, hasta `cols` (por defecto 2) cuando hay espacio.
 * Todo alineado arriba: la ayuda bajo un campo no mueve a sus vecinos.
 * Campo a todo el ancho: <Field span="full"> o className="span-all".
 */
export function FormGrid({ children, cols = 2, className = '' }: { children: ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return <div className={`bx-form-grid cols-${cols} ${className}`}>{children}</div>;
}

/** Botones del formulario, alineados al final (en movil a todo el ancho). */
export function FormActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bx-form-actions ${className}`}>{children}</div>;
}

/* ══ Checkbox ════════════════════════════════════════════════════════ */

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto clickeable (puede llevar enlaces). */
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  /** Texto accesible si no hay label visible. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Casilla de verificacion con el diseño del tema (input nativo oculto: teclado y lector de pantalla). */
export function Checkbox({ checked, onChange, label, description, disabled, required, id, name, ariaLabel, size = 'md', className = '' }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className={`bx-check ${size === 'sm' ? 'sm' : ''} ${disabled ? 'disabled' : ''} ${className}`} htmlFor={inputId}>
      <input id={inputId} name={name} type="checkbox" className="bx-check-input" checked={checked} disabled={disabled}
             required={required} aria-label={!label ? ariaLabel : undefined} onChange={e => onChange(e.target.checked)} />
      <span className="bx-check-box" aria-hidden="true">
        <svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.4 12.5 4.8" /></svg>
      </span>
      {(label || description) && (
        <span className="bx-check-text">
          {label && <span className="bx-check-label">{label}</span>}
          {description && <span className="bx-check-desc">{description}</span>}
        </span>
      )}
    </label>
  );
}

/* ══ IconButton ══════════════════════════════════════════════════════ */

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Clase FontAwesome sin prefijo, ej. 'fa-pen'. */
  icon: string;
  /** Texto accesible y del title (obligatorio: el boton no tiene texto visible). */
  label: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'ghost' | 'danger';
}

/** Boton redondo de solo icono, con aria-label y title. */
export function IconButton({ icon, label, size = 'md', variant = 'default', className = '', type = 'button', ...rest }: IconButtonProps) {
  const cls = ['bx-icon-btn', size === 'sm' ? 'sm' : '', variant === 'ghost' ? 'ghost' : '', variant === 'danger' ? 'danger' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} aria-label={label} title={label} {...rest}>
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
    </button>
  );
}

/* ══ InfoList: pares etiqueta / valor ════════════════════════════════ */

export interface InfoItem {
  label: ReactNode;
  value: ReactNode;
  /** Ocupa todo el ancho (textos largos como direcciones). */
  wide?: boolean;
  hidden?: boolean;
}

/** Lista de datos de solo lectura que se acomoda sola (2-3 columnas en PC, 1 en movil). */
export function InfoList({ items, className = '' }: { items: InfoItem[]; className?: string }) {
  return (
    <dl className={`bx-info ${className}`}>
      {items.filter(i => !i.hidden).map((i, idx) => (
        <div key={idx} className={i.wide ? 'wide' : ''}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ══ Notice: aviso dentro de la pagina ═══════════════════════════════ */

export interface NoticeProps {
  tone?: 'info' | 'ok' | 'warn' | 'bad' | 'primary' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  /** Clase FontAwesome sin prefijo. Por defecto segun el tono. */
  icon?: string;
  /** Boton o enlace a la derecha (abajo en movil). */
  action?: ReactNode;
  className?: string;
}

const NOTICE_ICON: Record<string, string> = {
  info: 'fa-circle-info', ok: 'fa-circle-check', warn: 'fa-triangle-exclamation', bad: 'fa-circle-exclamation', primary: 'fa-circle-info', neutral: 'fa-circle-info',
};

/** Aviso con icono, titulo, texto y accion. Reemplaza los .alert sueltos. */
export function Notice({ tone = 'info', title, children, icon, action, className = '' }: NoticeProps) {
  return (
    <div className={`bx-notice bx-tone-${tone} ${className}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <i className={`fa-solid ${icon ?? NOTICE_ICON[tone]} bx-notice-icon`} aria-hidden="true" />
      <div className="bx-notice-text">
        {title && <div className="bx-notice-title">{title}</div>}
        {children && <div className="bx-notice-body">{children}</div>}
      </div>
      {action && <div className="bx-notice-action">{action}</div>}
    </div>
  );
}
