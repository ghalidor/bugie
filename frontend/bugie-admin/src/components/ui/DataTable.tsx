import { ReactNode } from 'react';
import { ActionItem, ActionMenu } from './ActionMenu';
import { EmptyState, EmptyStateProps, Skeleton } from './Basics';
import { useIsMobile } from './hooks';

export interface Column<T> {
  /** Identificador unico de la columna. */
  key: string;
  header: ReactNode;
  /** Como pintar la celda. Si no se pasa, se usa row[key]. */
  render?: (row: T) => ReactNode;
  /**
   * Prioridad de la columna:
   *   1 = dato clave: siempre visible; en movil aparece en la tarjeta (max. 3).
   *   2 = normal: visible desde lg (992px).
   *   3 = secundaria: visible desde xl (1200px).
   * Por defecto 2.
   */
  priority?: 1 | 2 | 3;
  align?: 'left' | 'right' | 'center';
  /** Ancho CSS opcional (ej. '30%'). Evita px fijos. */
  width?: string;
  /** Etiqueta en la tarjeta movil si header no es texto. */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Estado vacio: props de EmptyState o un nodo propio. */
  empty?: EmptyStateProps | ReactNode;
  onRowClick?: (row: T) => void;
  /** Acciones por fila. En escritorio van en "⋯" (o en linea con inlineActions); en movil siempre en "⋯". */
  actions?: (row: T) => ActionItem[];
  /** Muestra las acciones como botones pequeños en escritorio. */
  inlineActions?: boolean;
  /** Titulo de la tarjeta en movil. Por defecto, la primera columna. */
  mobileTitle?: (row: T) => ReactNode;
  /** Linea secundaria de la tarjeta en movil. */
  mobileSubtitle?: (row: T) => ReactNode;
  /** Alto maximo de la tabla (cabecera fija al hacer scroll). Por defecto 'min(70dvh, 760px)'. 'none' = sin limite. */
  maxHeight?: string;
  skeletonRows?: number;
  /** Texto para lectores de pantalla. */
  caption?: string;
  className?: string;
}

const visibility = (p: 1 | 2 | 3 = 2) => (p === 3 ? 'd-none d-xl-table-cell' : p === 2 ? 'd-none d-lg-table-cell' : '');
const alignCls = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'al-right' : a === 'center' ? 'al-center' : '');

function cell<T>(col: Column<T>, row: T): ReactNode {
  if (col.render) return col.render(row);
  const v = (row as Record<string, unknown>)[col.key];
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function isEmptyProps(x: unknown): x is EmptyStateProps {
  return !!x && typeof x === 'object' && 'title' in (x as object) && !('$$typeof' in (x as object));
}

/**
 * Tabla de datos responsiva:
 *  - >= md: tabla densa con cabecera fija; columnas se ocultan segun prioridad.
 *  - <  md: cada fila es una tarjeta con titulo, 2-3 datos clave y menu "⋯".
 */
export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick, actions, inlineActions, mobileTitle, mobileSubtitle, maxHeight = 'min(70dvh, 760px)', skeletonRows = 5, caption, className = '' }: DataTableProps<T>) {
  const isMobile = useIsMobile();

  const emptyNode = isEmptyProps(empty)
    ? <EmptyState compact {...empty} />
    : (empty ?? <EmptyState compact title="No hay registros" text="Cuando haya datos aparecerán aquí." />);

  if (!loading && rows.length === 0) return <div className={className}>{emptyNode}</div>;

  /* ── Movil: tarjetas ─────────────────────────────────────────────── */
  if (isMobile) {
    const titleCol = columns[0];
    const keyCols = columns.filter(c => c !== titleCol && (c.priority ?? 2) === 1).slice(0, 3);
    if (loading) {
      return (
        <div className={`bx-cards ${className}`} aria-busy="true">
          {Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
            <div key={i} className="bx-row-card"><Skeleton width="55%" height={16} /><Skeleton count={2} height={12} /></div>
          ))}
        </div>
      );
    }
    return (
      <div className={`bx-cards ${className}`}>
        {rows.map(row => {
          const acts = actions?.(row) ?? [];
          return (
            <article
              key={rowKey(row)}
              className={`bx-row-card ${onRowClick ? 'clickable' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? e => { if (e.key === 'Enter') onRowClick(row); } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              <div className="bx-row-card-head">
                <div style={{ minWidth: 0 }}>
                  <div className="bx-row-card-title">{mobileTitle ? mobileTitle(row) : cell(titleCol, row)}</div>
                  {mobileSubtitle && <div className="bx-row-card-sub">{mobileSubtitle(row)}</div>}
                </div>
                {acts.length > 0 && <ActionMenu items={acts} />}
              </div>
              {keyCols.length > 0 && (
                <dl className="bx-row-card-fields">
                  {keyCols.map(c => (
                    <div key={c.key} style={{ minWidth: 0 }}>
                      <dt>{c.mobileLabel ?? (typeof c.header === 'string' ? c.header : c.key)}</dt>
                      <dd>{cell(c, row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          );
        })}
      </div>
    );
  }

  /* ── Escritorio / tablet: tabla ──────────────────────────────────── */
  const hasActions = !!actions;
  return (
    <div className={`bx-table-wrap ${className}`} style={{ maxHeight: maxHeight === 'none' ? undefined : maxHeight }} aria-busy={loading || undefined}>
      <table className="bx-table">
        {caption && <caption className="bx-sr">{caption}</caption>}
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} scope="col" className={`${visibility(c.priority)} ${alignCls(c.align)}`} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
            ))}
            {hasActions && <th scope="col" className="col-actions"><span className="bx-sr">Acciones</span></th>}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk${i}`}>
                  {columns.map(c => <td key={c.key} className={visibility(c.priority)}><Skeleton height={12} width={`${50 + ((i * 17 + c.key.length * 7) % 45)}%`} /></td>)}
                  {hasActions && <td />}
                </tr>
              ))
            : rows.map(row => {
                const acts = (actions?.(row) ?? []).filter(a => !a.hidden);
                return (
                  <tr
                    key={rowKey(row)}
                    className={onRowClick ? 'clickable' : ''}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? e => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {columns.map(c => (
                      <td key={c.key} className={`${visibility(c.priority)} ${alignCls(c.align)}`}>{cell(c, row)}</td>
                    ))}
                    {hasActions && (
                      <td className="col-actions" onClick={e => e.stopPropagation()}>
                        {inlineActions
                          ? (
                            <div className="d-inline-flex gap-1">
                              {acts.map(a => (
                                <button
                                  key={a.label}
                                  type="button"
                                  className={`btn btn-sm ${a.danger ? 'btn-outline-danger' : 'btn-outline-secondary'}`}
                                  disabled={a.disabled}
                                  onClick={a.onClick}
                                >
                                  {a.icon && <i className={`fa-solid ${a.icon} me-1`} aria-hidden="true" />}{a.label}
                                </button>
                              ))}
                            </div>
                          )
                          : <ActionMenu items={acts} />}
                      </td>
                    )}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
