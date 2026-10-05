import { cloneElement, isValidElement, ReactElement, ReactNode, useCallback, useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from './Tooltip';
import { useConfirm } from './ConfirmDialog';

/* ══ Field ═══════════════════════════════════════════════════════════ */

export interface FieldProps {
  label: ReactNode;
  /** Un solo control (input, select, textarea). Recibe id y aria-* automaticamente. */
  children: ReactNode;
  /** Ayuda corta bajo el control (una linea). */
  help?: ReactNode;
  /** Ayuda larga: aparece en un tooltip con el icono "?" junto a la etiqueta. */
  helpLong?: ReactNode;
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
export function Field({ label, children, help, helpLong, error, required, optional, id, span, className = '' }: FieldProps) {
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
    <div className={`bx-field ${error ? 'has-error' : ''} ${span === 'full' ? 'bx-col-full' : ''} ${className}`}>
      <label className="bx-field-label" htmlFor={controlId}>
        {label}
        {required && <span className="bx-field-req" aria-hidden="true">*</span>}
        {optional && <span className="bx-field-opt">(opcional)</span>}
        {helpLong && (
          <Tooltip content={helpLong}>
            <button type="button" className="bx-help-dot" aria-label="Más información">
              <i className="fa-solid fa-question" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </label>
      {control}
      {help && !error && <p id={helpId} className="bx-field-help">{help}</p>}
      {error && <p id={errId} className="bx-field-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />{error}</p>}
    </div>
  );
}

/* ══ FormGrid / FormActions ═════════════════════════════════════════ */

export interface FormGridProps {
  children: ReactNode;
  /** Columnas maximas (por defecto 2). Colapsa a 1 si no caben (minimo ~12rem por columna). */
  cols?: 1 | 2 | 3;
  className?: string;
}

/**
 * Grilla de formulario: 1 columna en movil, hasta `cols` cuando hay espacio.
 * Etiquetas y controles alineados arriba: la ayuda bajo un campo no mueve a sus vecinos.
 * Un campo de ancho completo: <Field span="full"> o className="bx-col-full".
 */
export function FormGrid({ children, cols = 2, className = '' }: FormGridProps) {
  return <div className={`bx-form-grid cols-${cols} ${className}`}>{children}</div>;
}

/** Botones de accion del formulario, alineados al final (en movil a todo el ancho). */
export function FormActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bx-form-actions ${className}`}>{children}</div>;
}

/* ══ Checkbox ════════════════════════════════════════════════════════ */

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  /** Explicacion corta bajo la etiqueta. */
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** Texto accesible si no hay label visible. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Casilla de verificacion con el diseño del tema (input nativo oculto: teclado y lector de pantalla). */
export function Checkbox({ checked, onChange, label, description, disabled, id, name, ariaLabel, size = 'md', className = '' }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className={`bx-check ${size === 'sm' ? 'sm' : ''} ${disabled ? 'disabled' : ''} ${className}`} htmlFor={inputId}>
      <input id={inputId} name={name} type="checkbox" className="bx-check-input" checked={checked} disabled={disabled}
             aria-label={!label ? ariaLabel : undefined} onChange={e => onChange(e.target.checked)} />
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

/* ══ Switch ══════════════════════════════════════════════════════════ */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  /** Explicacion corta bajo la etiqueta. */
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  /** Texto accesible si no hay label visible. */
  ariaLabel?: string;
}

/** Interruptor para opciones si/no. */
export function Switch({ checked, onChange, label, description, disabled, id, ariaLabel }: SwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label className={`bx-switch ${disabled ? 'disabled' : ''}`} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        aria-label={!label ? ariaLabel : undefined}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="bx-switch-track" aria-hidden="true" />
      {(label || description) && (
        <span className="bx-switch-text">
          {label && <span className="bx-switch-label">{label}</span>}
          {description && <span className="bx-switch-desc">{description}</span>}
        </span>
      )}
    </label>
  );
}

/* ══ SaveBar ═════════════════════════════════════════════════════════ */

export interface SaveBarProps {
  /** Se muestra solo si hay cambios sin guardar. */
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
  message?: string;
  saveText?: string;
}

/** Barra fija abajo: "Tienes cambios sin guardar · Descartar · Guardar". */
export function SaveBar({ dirty, onSave, onDiscard, saving, message = 'Tienes cambios sin guardar', saveText = 'Guardar' }: SaveBarProps) {
  if (!dirty && !saving) return null;
  return (
    <div className="bx-savebar" role="region" aria-label="Cambios sin guardar">
      <div className="bx-savebar-msg"><i className="fa-solid fa-pen-to-square" aria-hidden="true" />{message}</div>
      <div className="bx-savebar-actions">
        <button type="button" className="btn btn-sm btn-link" onClick={onDiscard} disabled={saving}>Descartar</button>
        <button type="button" className="btn btn-sm btn-bugie px-3" onClick={onSave} disabled={saving}>
          {saving && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {saveText}
        </button>
      </div>
    </div>
  );
}

/* ══ useUnsavedChanges ═══════════════════════════════════════════════ */

const LEAVE_OPTS = {
  title: '¿Salir sin guardar?',
  message: 'Tienes cambios sin guardar. Si sales ahora se perderán.',
  confirmText: 'Salir sin guardar',
  cancelText: 'Seguir editando',
  tone: 'warning' as const,
};

/**
 * Avisa antes de perder cambios:
 *  - al cerrar o recargar la pestaña (aviso del navegador),
 *  - al hacer clic en cualquier enlace interno (menu, migas, etc.).
 * Devuelve confirmLeave() para usarlo antes de navegar por codigo:
 *   if (await confirmLeave()) navigate('/admin/x');
 * Limitacion: el boton "Atras" del navegador no se intercepta
 * (BrowserRouter no permite bloquearlo sin migrar a createBrowserRouter).
 */
export function useUnsavedChanges(dirty: boolean) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      confirm(LEAVE_OPTS).then(ok => { if (ok) { dirtyRef.current = false; navigate(url.pathname + url.search + url.hash); } });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, confirm, navigate]);

  const confirmLeave = useCallback(async () => {
    if (!dirtyRef.current) return true;
    return !!(await confirm(LEAVE_OPTS));
  }, [confirm]);

  return { confirmLeave };
}
