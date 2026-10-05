/// Exportar a CSV desde el panel (lo usan Viajes, Pasajeros, Conductores,
/// Pagos, Pagos a conductores y Libro de Reclamaciones).
///
/// - downloadCsv: arma y descarga el archivo. Abre bien en Excel: separador ;
///   y BOM UTF-8 (tildes y ñ correctas).
/// - fetchAllPages: pide TODAS las páginas de un listado paginado (no se queda
///   en la primera). Si hay más filas que el tope, devuelve truncated = true
///   para avisar al usuario (nunca se corta en silencio).

export type CsvCell = string | number | boolean | null | undefined;

const esc = (v: CsvCell) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function downloadCsv(head: string[], rows: CsvCell[][], filename: string) {
  const lines = [head.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Fecha de hoy (yyyy-mm-dd, hora local) para el nombre del archivo. */
export function csvDateTag(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha y hora legible para una celda del CSV ('' si no hay). */
export const csvDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/** Tope de filas por exportación (evita descargas enormes en el navegador). */
export const CSV_MAX_ROWS = 20000;

export interface AllPagesResult<T> { items: T[]; total: number; truncated: boolean; }

/// Pide página por página hasta traer todo (o hasta maxRows).
/// fetchPage(page, pageSize) debe devolver { items, total }.
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  pageSize = 100,
  maxRows = CSV_MAX_ROWS,
): Promise<AllPagesResult<T>> {
  const items: T[] = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const res = await fetchPage(page, pageSize);
    total = res.total ?? 0;
    items.push(...(res.items ?? []));
    if (!res.items?.length || items.length >= total || items.length >= maxRows) break;
  }
  const truncated = total > items.length;
  return { items: items.slice(0, maxRows), total, truncated };
}

/** Mensaje del toast tras exportar ("Se exportaron 120 viajes." o aviso si se cortó). */
export function csvResultMessage(r: AllPagesResult<unknown>, singular: string, plural: string) {
  const n = r.items.length;
  if (r.truncated)
    return `Se exportaron ${n.toLocaleString('es-PE')} de ${r.total.toLocaleString('es-PE')} ${plural} (máximo por archivo). Usa un rango de fechas más corto para exportar el resto.`;
  return `Se exportaron ${n.toLocaleString('es-PE')} ${n === 1 ? singular : plural}.`;
}
