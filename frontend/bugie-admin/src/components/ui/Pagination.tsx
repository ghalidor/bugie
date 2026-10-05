import { useId } from 'react';
import { Select } from './Select';

export interface PaginationProps {
  /** Pagina actual, empieza en 1. */
  page: number;
  pageSize: number;
  /** Total de registros. */
  total: number;
  onPageChange: (page: number) => void;
  /** Si se pasa, muestra el selector "Por página". */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

/** Lista compacta de paginas: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

/** Paginacion unica del panel: "1–20 de 340", anterior/siguiente y numeros (ocultos en movil). */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100], className = '' }: PaginationProps) {
  const sizeId = useId();
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  if (total === 0) return null;

  return (
    <nav className={`bx-pagination ${className}`} aria-label="Paginación">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span aria-live="polite">{from}–{to} de {total.toLocaleString('es-PE')}</span>
        {onPageSizeChange && (
          <>
            <label htmlFor={sizeId} className="bx-sr">Registros por página</label>
            <Select
              id={sizeId}
              size="sm"
              width="auto"
              className="bx-page-size"
              value={pageSize}
              onChange={onPageSizeChange}
              // Si la página usa un tamaño que no está en la lista, se agrega (si no, el Select queda vacío).
              options={[...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b)
                .map(n => ({ value: n, label: `${n} por página` }))}
            />

          </>
        )}
      </div>
      {pages > 1 && (
        <div className="bx-pagination-pages">
          <button type="button" className="bx-page-btn" onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="Página anterior">
            <i className="fa-solid fa-chevron-left" aria-hidden="true" />
          </button>
          {pageList(current, pages).map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} className="bx-page-num px-1" aria-hidden="true">…</span>
              : (
                <button
                  key={p}
                  type="button"
                  className="bx-page-btn bx-page-num"
                  aria-current={p === current ? 'page' : undefined}
                  aria-label={`Página ${p}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              ),
          )}
          <span className="d-sm-none px-1">{current} / {pages}</span>
          <button type="button" className="bx-page-btn" onClick={() => onPageChange(current + 1)} disabled={current >= pages} aria-label="Página siguiente">
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
