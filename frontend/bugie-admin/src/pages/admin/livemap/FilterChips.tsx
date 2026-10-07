import { MONITOR_FILTERS, MonitorFilter } from './monitorFilters';

interface Props {
  selected: MonitorFilter[];
  counts: Record<MonitorFilter, number>;
  /** Filtros que se pueden usar con los datos actuales (p. ej. "Envíos" solo si el servidor indica el tipo). */
  available: Set<MonitorFilter>;
  onChange: (next: MonitorFilter[]) => void;
}

/** Chips de filtro del Monitoreo con contador. Se pueden elegir varios. */
export default function FilterChips({ selected, counts, available, onChange }: Props) {
  const toggle = (k: MonitorFilter) =>
    onChange(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k]);

  return (
    <div className="lm-chips bx-chips" role="group" aria-label="Filtrar el mapa y las listas" data-tour="monitor-filters">
      {MONITOR_FILTERS.filter(f => available.has(f.key)).map(f => {
        const on = selected.includes(f.key);
        return (
          <button key={f.key} type="button" className="bx-chip lm-chip" aria-pressed={on} onClick={() => toggle(f.key)}
                  title={`${f.hint}${on ? ' · toca para quitar el filtro' : ''}`}>
            <span className="dot" style={{ background: f.color }} aria-hidden="true" />
            {f.label}
            <span className="count">{counts[f.key]}</span>
          </button>
        );
      })}
      {selected.length > 0 && (
        <button type="button" className="bx-chip lm-chip-clear" onClick={() => onChange([])}>
          <i className="fa-solid fa-xmark" aria-hidden="true" />Quitar filtros
        </button>
      )}
    </div>
  );
}
