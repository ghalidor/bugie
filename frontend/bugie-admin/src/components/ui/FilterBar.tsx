import { ReactNode, useId, useState } from 'react';
import { Drawer } from './Modal';
import { useIsMobile } from './hooks';

export interface FilterChip {
  value: string;
  label: ReactNode;
  count?: number;
}

export interface FilterBarProps {
  /** Texto del buscador (controlado). Si no se pasa onSearchChange, no hay buscador. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Chips de filtro rapido (una sola opcion activa). */
  chips?: FilterChip[];
  chip?: string;
  onChipChange?: (value: string) => void;
  /** Filtros extra (selects, fechas...). En pantallas < md se abren en un Drawer con el boton "Filtros". */
  children?: ReactNode;
  /** Cuantos filtros extra estan activos (se muestra en el boton "Filtros"). */
  activeCount?: number;
  /** Si se pasa, muestra "Limpiar filtros". */
  onClear?: () => void;
  /** Botones a la derecha (ej. Exportar). */
  actions?: ReactNode;
  className?: string;
}

/** Barra de busqueda + chips + filtros extra. Sin anchos fijos: se adapta sola. */
export function FilterBar({ search, onSearchChange, searchPlaceholder = 'Buscar…', chips, chip, onChipChange, children, activeCount = 0, onClear, actions, className = '' }: FilterBarProps) {
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const searchId = useId();
  const hasExtra = !!children;

  return (
    <div className={`bx-filterbar ${className}`} role="search">
      <div className="bx-filterbar-row">
        {onSearchChange && (
          <div className="bx-search">
            <label htmlFor={searchId} className="bx-sr">{searchPlaceholder}</label>
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              className="form-control"
              placeholder={searchPlaceholder}
              value={search ?? ''}
              onChange={e => onSearchChange(e.target.value)}
            />
            {search && (
              <button type="button" className="bx-search-clear" onClick={() => onSearchChange('')} aria-label="Borrar búsqueda">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {hasExtra && !isMobile && <div className="bx-filter-extra">{children}</div>}

        {hasExtra && isMobile && (
          <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2" onClick={() => setDrawer(true)}>
            <i className="fa-solid fa-sliders" aria-hidden="true" />
            Filtros
            {activeCount > 0 && <span className="bx-filter-dot">{activeCount}</span>}
          </button>
        )}

        {onClear && activeCount > 0 && !isMobile && (
          <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={onClear}>Limpiar filtros</button>
        )}

        {actions && <div className="d-flex gap-2 flex-wrap ms-auto">{actions}</div>}
      </div>

      {chips && chips.length > 0 && (
        <div className="bx-chips" role="group" aria-label="Filtro rápido">
          {chips.map(c => (
            <button
              key={c.value}
              type="button"
              className="bx-chip"
              aria-pressed={c.value === chip}
              onClick={() => onChipChange?.(c.value)}
            >
              {c.label}
              {typeof c.count === 'number' && <span className="count">{c.count}</span>}
            </button>
          ))}
        </div>
      )}

      {hasExtra && isMobile && (
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          title="Filtros"
          size="sm"
          footer={
            <>
              {onClear && <button type="button" className="btn btn-outline-secondary" onClick={() => { onClear(); }}>Limpiar</button>}
              <button type="button" className="btn btn-bugie" onClick={() => setDrawer(false)}>Ver resultados</button>
            </>
          }
        >
          <div className="d-grid gap-3">{children}</div>
        </Drawer>
      )}
    </div>
  );
}
