import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export interface PageAction {
  label: string;
  /** Clase FontAwesome sin prefijo, ej. 'fa-plus'. */
  icon?: string;
  onClick?: () => void;
  /** Ruta interna (en vez de onClick). */
  to?: string;
  /** 'primary' = boton principal. */
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Texto del title (por ejemplo, por que esta deshabilitado). */
  title?: string;
  /** Muestra spinner. */
  loading?: boolean;
  hidden?: boolean;
}

export interface PageProps {
  title: string;
  /** Una sola linea que explica para que sirve la pagina. */
  subtitle?: ReactNode;
  /** Clase FontAwesome sin prefijo. */
  icon?: string;
  /** Botones de la cabecera. En movil pasan debajo del titulo y ocupan el ancho. */
  actions?: PageAction[];
  /** Contenido libre junto a las acciones (ej. una etiqueta de estado). */
  extra?: ReactNode;
  /** Enlace "volver" sobre el titulo. */
  back?: { to: string; label?: string };
  children?: ReactNode;
  className?: string;
}

function ActionButton({ a }: { a: PageAction }) {
  const navigate = useNavigate();
  const cls = a.variant === 'primary' ? 'btn-bugie' : a.variant === 'danger' ? 'btn-outline-danger' : 'btn-bugie-outline';
  return (
    <button
      type="button"
      className={`btn ${cls} bx-page-btn-action`}
      disabled={a.disabled || a.loading}
      title={a.title}
      onClick={() => (a.to ? navigate(a.to) : a.onClick?.())}
    >
      {a.loading
        ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        : a.icon && <i className={`fa-solid ${a.icon}`} aria-hidden="true" />}
      <span>{a.label}</span>
    </button>
  );
}

/**
 * Contenedor estandar de pagina: cabecera compacta (icono, titulo,
 * subtitulo, acciones) y contenido con separacion uniforme.
 */
export function Page({ title, subtitle, icon, actions = [], extra, back, children, className = '' }: PageProps) {
  const visible = actions.filter(a => !a.hidden);
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
        {(extra || visible.length > 0) && (
          <div className="bx-page-actions">
            {extra && <span className="bx-page-extra">{extra}</span>}
            {visible.map(a => <ActionButton key={a.label} a={a} />)}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

/** Pantalla de carga de pagina completa (skeleton de cabecera + tarjetas). */
export function PageLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="bx-page" aria-busy="true" aria-live="polite">
      <span className="bx-sr">{label}</span>
      <div className="d-flex align-items-center gap-3">
        <span className="bx-skeleton" style={{ width: 42, height: 42, borderRadius: 12 }} />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <span className="bx-skeleton" style={{ width: '40%', height: 22, marginBottom: 8 }} />
          <span className="bx-skeleton" style={{ width: '65%', height: 14 }} />
        </div>
      </div>
      <div className="bx-stat-grid">
        {[0, 1, 2].map(i => <span key={i} className="bx-skeleton" style={{ height: 104, borderRadius: 18 }} />)}
      </div>
      <span className="bx-skeleton" style={{ height: 220, borderRadius: 18 }} />
    </div>
  );
}
