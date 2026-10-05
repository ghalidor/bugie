/// Filtro "Desde / Hasta" (fechas yyyy-mm-dd) para las barras de filtros.
/// Usa la clase .ops-filter (src/pages/admin/ops.scss). Si "Hasta" queda antes
/// que "Desde", se corrige solo para no pedir un rango vacío.
export interface DateRange { from: string; to: string; }

export const EMPTY_RANGE: DateRange = { from: '', to: '' };

/** Cuántos extremos del rango están puestos (para el contador de filtros activos). */
export const rangeCount = (r: DateRange) => (r.from ? 1 : 0) + (r.to ? 1 : 0);

/** Agrega from/to a los parámetros de la URL (solo los que tengan valor). */
export function appendRange(params: URLSearchParams, r: DateRange) {
  if (r.from) params.append('from', r.from);
  if (r.to) params.append('to', r.to);
}

export default function DateRangeFilter({ value, onChange, label = 'Fecha' }: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  /** Texto para lectores de pantalla (ej. "Fecha del viaje"). */
  label?: string;
}) {
  const setFrom = (from: string) => onChange({ from, to: value.to && from && value.to < from ? from : value.to });
  const setTo = (to: string) => onChange({ to, from: value.from && to && value.from > to ? to : value.from });
  return (
    <>
      <label className="ops-filter">
        <span>Desde</span>
        <input type="date" className="form-control form-control-sm" aria-label={`${label}: desde`}
               value={value.from} max={value.to || undefined} onChange={e => setFrom(e.target.value)} />
      </label>
      <label className="ops-filter">
        <span>Hasta</span>
        <input type="date" className="form-control form-control-sm" aria-label={`${label}: hasta`}
               value={value.to} min={value.from || undefined} onChange={e => setTo(e.target.value)} />
      </label>
    </>
  );
}
