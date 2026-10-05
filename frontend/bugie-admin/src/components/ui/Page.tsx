import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionItem, ActionMenu } from './ActionMenu';
import { useIsMobile } from './hooks';
import { IconButton } from './Tooltip';
import { useAutoTour, useTour } from './Tour';

export interface PageAction {
  label: string;
  /** Clase FontAwesome sin prefijo, ej. 'fa-plus'. */
  icon?: string;
  onClick?: () => void;
  /** Ruta interna (en vez de onClick). */
  to?: string;
  /** 'primary' = boton principal (sigue visible en movil). */
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Muestra spinner. */
  loading?: boolean;
  hidden?: boolean;
}

export interface PageProps {
  title: string;
  /** Una sola linea que explica para que sirve la pagina. */
  subtitle?: string;
  /** Clase FontAwesome sin prefijo. */
  icon?: string;
  /** Botones de la cabecera. En movil solo queda visible el 'primary'; el resto va al menu "⋯". */
  actions?: PageAction[];
  /** Contenido libre junto a las acciones (ej. "Actualizado hace 5 s"). */
  extra?: ReactNode;
  /** Enlace "volver" sobre el titulo. */
  back?: { to: string; label?: string };
  /** Clave del tour (src/tours/<helpKey>.json). Muestra el boton "?" y lanza el tour la primera vez. */
  helpKey?: string;
  /** No lanzar el tour automaticamente la primera vez. */
  noAutoTour?: boolean;
  children?: ReactNode;
  className?: string;
}

function ActionButton({ a }: { a: PageAction }) {
  const navigate = useNavigate();
  const cls = a.variant === 'primary' ? 'btn-bugie' : a.variant === 'danger' ? 'btn-outline-danger' : 'btn-outline-secondary';
  return (
    <button
      type="button"
      className={`btn btn-sm ${cls} d-inline-flex align-items-center gap-2 px-3`}
      disabled={a.disabled || a.loading}
      onClick={() => (a.to ? navigate(a.to) : a.onClick?.())}
    >
      {a.loading
        ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        : a.icon && <i className={`fa-solid ${a.icon}`} aria-hidden="true" />}
      {a.label}
    </button>
  );
}

/**
 * Contenedor estandar de pagina: cabecera compacta (titulo, subtitulo,
 * acciones, ayuda) y contenido con separacion uniforme.
 */
export function Page({ title, subtitle, icon, actions = [], extra, back, helpKey, noAutoTour, children, className = '' }: PageProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const tour = useTour();
  useAutoTour(helpKey, !noAutoTour);

  const visible = actions.filter(a => !a.hidden);
  const primary = visible.filter(a => a.variant === 'primary');
  const rest = visible.filter(a => a.variant !== 'primary');
  const showHelp = !!helpKey && tour.hasTour(helpKey);

  const menuItems: ActionItem[] = rest.map(a => ({
    label: a.label, icon: a.icon, onClick: a.onClick, to: a.to, danger: a.variant === 'danger', disabled: a.disabled || a.loading,
  }));

  return (
    <div className={`bx-page ${className}`}>
      <header className="bx-page-head">
        <div className="bx-page-titles">
          {icon && <span className="bx-page-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>}
          <div style={{ minWidth: 0 }}>
            {back && (
              <Link to={back.to} className="bx-page-back">
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />{back.label ?? 'Volver'}
              </Link>
            )}
            <h1 className="bx-page-title">{title}</h1>
            {subtitle && <p className="bx-page-sub">{subtitle}</p>}
          </div>
        </div>

        <div className="bx-page-actions" data-tour="page-actions">
          {extra && <span className="bx-page-extra">{extra}</span>}
          {isMobile
            ? (
              <>
                {primary.map(a => <ActionButton key={a.label} a={a} />)}
                {/* Una sola accion con icono: boton de icono directo (un menu de 1 item no aporta). */}
                {rest.length === 1 && rest[0].icon
                  ? <IconButton icon={rest[0].icon} label={rest[0].label} disabled={rest[0].disabled || rest[0].loading} onClick={() => (rest[0].to ? navigate(rest[0].to) : rest[0].onClick?.())} />
                  : menuItems.length > 0 && <ActionMenu items={menuItems} triggerClassName="bx-icon-btn" />}
              </>
            )
            : visible.map(a => <ActionButton key={a.label} a={a} />)}
          {showHelp && (
            <span data-tour="page-help">
              <IconButton icon="fa-question" label="Ver recorrido de ayuda" onClick={() => tour.start(helpKey!)} />
            </span>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
