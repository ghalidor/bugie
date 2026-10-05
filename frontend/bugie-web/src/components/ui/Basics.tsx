import { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

/* ══ Tonos ═══════════════════════════════════════════════════════════ */

/** Variantes de color comunes a badges, stats e iconos. */
export type Tone = 'primary' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** Clase CSS del tono (define --tone y --tone-bg). */
export const toneClass = (tone: Tone = 'neutral') => `bx-tone-${tone}`;

const STATUS_TONES: Record<string, Tone> = {
  // ok
  approved: 'ok', aprobado: 'ok', active: 'ok', activo: 'ok', completed: 'ok', completado: 'ok',
  paid: 'ok', pagado: 'ok', online: 'ok', verified: 'ok', verificado: 'ok', resolved: 'ok', resuelto: 'ok',
  published: 'ok', publicado: 'ok', delivered: 'ok', entregado: 'ok', success: 'ok',
  // warn
  pending: 'warn', pendiente: 'warn', review: 'warn', in_review: 'warn', revision: 'warn', waiting: 'warn',
  processing: 'warn', procesando: 'warn', draft: 'warn', borrador: 'warn', expiring: 'warn',
  // bad
  rejected: 'bad', rechazado: 'bad', cancelled: 'bad', canceled: 'bad', cancelado: 'bad', failed: 'bad',
  fallido: 'bad', blocked: 'bad', bloqueado: 'bad', suspended: 'bad', suspendido: 'bad', offline: 'bad',
  expired: 'bad', vencido: 'bad', error: 'bad',
  // info
  in_progress: 'info', en_curso: 'info', started: 'info', accepted: 'info', aceptado: 'info', assigned: 'info',
  // neutral
  inactive: 'neutral', inactivo: 'neutral', closed: 'neutral', cerrado: 'neutral', archived: 'neutral',
};

/**
 * Adivina el tono de un estado comun (approved, pendiente, cancelled...).
 * Si no lo conoce devuelve 'neutral'. Puedes pasar un mapa propio que tiene prioridad.
 */
export function statusTone(status: string | null | undefined, custom?: Record<string, Tone>): Tone {
  const k = (status ?? '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  return custom?.[k] ?? STATUS_TONES[k] ?? 'neutral';
}

/* ══ StatusBadge ═════════════════════════════════════════════════════ */

export interface StatusBadgeProps {
  tone?: Tone;
  children: ReactNode;
  /** Clase FontAwesome sin prefijo. */
  icon?: string;
  /** Punto de color a la izquierda. */
  dot?: boolean;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}

/** Pastilla de estado con fondo suave (tokens --bugie-soft-*). */
export function StatusBadge({ tone = 'neutral', children, icon, dot, size = 'md', title, className = '' }: StatusBadgeProps) {
  return (
    <span className={`bx-badge ${size === 'sm' ? 'sm' : ''} ${toneClass(tone)} ${className}`} title={title}>
      {dot && <span className="bx-badge-dot" aria-hidden="true" />}
      {icon && <i className={`fa-solid ${icon}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ══ Skeleton ════════════════════════════════════════════════════════ */

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  /** Repite N bloques (lineas de texto). */
  count?: number;
  className?: string;
  style?: CSSProperties;
}

/** Bloque gris animado mientras carga el contenido. */
export function Skeleton({ width = '100%', height = 14, radius = 8, count = 1, className = '', style }: SkeletonProps) {
  const items = Array.from({ length: count });
  return (
    <>
      {items.map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`bx-skeleton ${className}`}
          style={{ width: count > 1 && i === count - 1 ? '60%' : width, height, borderRadius: radius, marginBottom: count > 1 ? 8 : undefined, ...style }}
        />
      ))}
    </>
  );
}

/* ══ EmptyState ══════════════════════════════════════════════════════ */

export interface EmptyStateProps {
  title: string;
  text?: ReactNode;
  /** Boton o enlace para salir del estado vacio. */
  action?: ReactNode;
  /** Icono FontAwesome en lugar de la ilustracion. */
  icon?: string;
  /** Version reducida para dentro de tarjetas. */
  compact?: boolean;
  /** 'done' muestra un check (todo al dia) en vez de la caja vacia. */
  variant?: 'empty' | 'done' | 'error';
}

function Illustration({ variant }: { variant: 'empty' | 'done' | 'error' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" aria-hidden="true">
      <ellipse cx="60" cy="80" rx="42" ry="6" fill="currentColor" opacity=".08" />
      <rect x="22" y="22" width="76" height="52" rx="10" fill="currentColor" opacity=".1" />
      <rect x="22" y="22" width="76" height="52" rx="10" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" />
      <path d="M22 40h76" stroke="currentColor" strokeOpacity=".3" strokeWidth="2" />
      {variant === 'done' && <path d="M46 56l9 9 19-19" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
      {variant === 'error' && <path d="M50 50l20 16M70 50L50 66" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />}
      {variant === 'empty' && <><circle cx="52" cy="57" r="9" stroke="currentColor" strokeWidth="4" /><path d="M59 64l9 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></>}
      <circle cx="33" cy="31" r="3" fill="currentColor" opacity=".45" />
      <circle cx="43" cy="31" r="3" fill="currentColor" opacity=".3" />
    </svg>
  );
}

/** Mensaje amable cuando no hay datos, con accion opcional. */
export function EmptyState({ title, text, action, icon, compact, variant = 'empty' }: EmptyStateProps) {
  return (
    <div className={`bx-empty ${compact ? 'compact' : ''}`} role="status">
      {icon ? <i className={`fa-solid ${icon}`} style={{ fontSize: compact ? '1.6rem' : '2.2rem', color: 'var(--bugie-primary)' }} aria-hidden="true" /> : <Illustration variant={variant} />}
      <p className="bx-empty-title">{title}</p>
      {text && <p className="bx-empty-text">{text}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* ══ SectionCard ═════════════════════════════════════════════════════ */

export interface SectionCardProps {
  title?: ReactNode;
  /** Una linea corta bajo el titulo. */
  description?: ReactNode;
  /** Clase FontAwesome sin prefijo para el titulo. */
  icon?: string;
  /** Botones a la derecha del titulo. */
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Sin relleno interno (para tablas y listas de borde a borde). */
  flush?: boolean;
  className?: string;
  id?: string;
  /** Atributo data-tour para el tour guiado. */
  tourId?: string;
}

/** Tarjeta con cabecera (titulo, descripcion, acciones) y cuerpo. */
export function SectionCard({ title, description, icon, actions, children, footer, flush, className = '', id, tourId }: SectionCardProps) {
  return (
    <section className={`bx-card ${className}`} id={id} data-tour={tourId}>
      {(title || actions) && (
        <header className="bx-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="bx-card-title">{icon && <i className={`fa-solid ${icon}`} aria-hidden="true" />}{title}</h2>}
            {description && <p className="bx-card-desc">{description}</p>}
          </div>
          {actions && <div className="d-flex gap-2 flex-wrap align-items-center">{actions}</div>}
        </header>
      )}
      <div className={`bx-card-body ${flush ? 'flush' : ''}`}>{children}</div>
      {footer && <footer className="bx-card-foot">{footer}</footer>}
    </section>
  );
}

/* ══ StatGrid / StatCard ═════════════════════════════════════════════ */

export interface StatGridProps {
  children: ReactNode;
  /** Ancho minimo de cada tarjeta. Por defecto 160px. */
  min?: number;
  className?: string;
  tourId?: string;
}

/** Grid que acomoda las StatCard solas: repeat(auto-fit, minmax(160px, 1fr)). */
export function StatGrid({ children, min = 160, className = '', tourId }: StatGridProps) {
  return (
    <div className={`bx-stat-grid ${className}`} style={{ ['--bx-stat-min' as string]: `${min}px` }} data-tour={tourId}>
      {children}
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Clase FontAwesome sin prefijo. */
  icon?: string;
  tone?: Tone;
  /** Texto pequeño de ayuda bajo la etiqueta. */
  hint?: ReactNode;
  /** Tendencia: texto (ej. '+12%') y si es buena o mala. */
  trend?: { value: string; direction: 'up' | 'down' | 'flat'; good?: boolean };
  /** Muestra skeleton en lugar del valor. */
  loading?: boolean;
  /** Punto animado (ej. hay alertas activas). */
  pulse?: boolean;
  /** Ruta interna: la tarjeta se vuelve enlace. */
  to?: string;
  onClick?: () => void;
}

/** Indicador (KPI) con icono, valor, etiqueta y tendencia opcional. */
export function StatCard({ label, value, icon, tone = 'primary', hint, trend, loading, pulse, to, onClick }: StatCardProps) {
  const body = (
    <>
      <div className="bx-stat-top">
        {icon ? <span className="bx-stat-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span> : <span />}
        {pulse && !loading && <span className="bx-pulse" aria-hidden="true" />}
        {trend && !pulse && (
          <span className={`bx-trend ${trend.direction === 'flat' ? 'flat' : (trend.good ?? trend.direction === 'up') ? 'good' : 'bad'}`}>
            <i className={`fa-solid ${trend.direction === 'up' ? 'fa-arrow-up' : trend.direction === 'down' ? 'fa-arrow-down' : 'fa-minus'}`} aria-hidden="true" />
            {trend.value}
          </span>
        )}
      </div>
      {loading ? <Skeleton width="45%" height={30} /> : <div className="bx-stat-value">{value}</div>}
      <div className="bx-stat-label">{label}</div>
      {hint && <div className="bx-stat-hint">{hint}</div>}
    </>
  );
  const cls = `bx-stat ${toneClass(tone)}`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
