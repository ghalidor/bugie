import { DateRangeField } from './ui';

/// Filtro "Desde / Hasta" (fechas yyyy-mm-dd) para las barras de filtros.
/// Usa la clase .ops-filter (src/pages/admin/ops.scss). Un solo calendario en
/// modo rango (con atajos): el rango siempre queda ordenado (desde <= hasta).
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
  return (
    <label className="ops-filter">
      <span>Fechas</span>
      <DateRangeField value={value} onChange={onChange} size="sm" aria-label={label} />
    </label>
  );
}
