import { useState } from 'react';
import { API, ApiError, apiFetch } from '../state/api';
import { PERMS, usePermissions } from '../state/permissions';
import { downloadCsv } from '../state/csv';
import { useToast } from './ui';

/*
 * Botón "Descargar GPS original" del detalle de un viaje: baja en CSV los
 * puntos GPS tal como los mandó el conductor (sin simplificar), desde la base
 * (viajes recientes) o desde el archivo histórico (Parquet) si ya se archivó.
 * GET {drivers}/drivers/admin/trips/{tripId}/path/raw
 */

interface RawPoint { lat: number; lng: number; speedKmh: number | null; heading: number | null; recordedAt: string; }
interface RawPathResponse {
  source: 'db' | 'parquet' | 'none';
  files?: string[];
  path: { tripId: string; points: number; distanceKm: number; firstAt: string | null; lastAt: string | null; path: RawPoint[] } | null;
}

const SOURCE_LABEL: Record<string, string> = { db: 'base de datos', parquet: 'archivo histórico' };

/** Mismos permisos que el detalle del viaje (y que el endpoint en Drivers). */
const TRIP_DETAIL_PERMS = [PERMS.ViewTrips, PERMS.ViewLiveMap, PERMS.ViewComplaints, PERMS.ViewSosCenter,
  PERMS.ViewPassengers, PERMS.ViewDrivers, PERMS.ViewPayments, PERMS.ViewCommissions];

/** "2026-10-07 14:05:09" (hora local del navegador). */
function fmtCsvDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const num = (v: number | null | undefined, digits: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '';

export default function RawGpsDownload({ tripId, className = '' }: { tripId: string; className?: string }) {
  const { has } = usePermissions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);

  if (!TRIP_DETAIL_PERMS.some(has)) return null;

  async function download() {
    setBusy(true);
    try {
      const r = await apiFetch<RawPathResponse>(`${API.drivers}/drivers/admin/trips/${tripId}/path/raw`);
      const points = r?.path?.path ?? [];
      if (!r || r.source === 'none' || points.length === 0) {
        setOrigin(null);
        toast.warning('No hay GPS guardado para este viaje.');
        return;
      }
      const rows = points.map(pt => [fmtCsvDate(pt.recordedAt), String(pt.lat), String(pt.lng), num(pt.speedKmh, 1), num(pt.heading, 0)]);
      downloadCsv(['fecha_hora', 'lat', 'lng', 'velocidad_kmh', 'rumbo'], rows, `gps_viaje_${tripId.slice(0, 8)}.csv`, ',');
      const label = SOURCE_LABEL[r.source] ?? r.source;
      setOrigin(label);
      toast.success(`Se descargaron ${points.length.toLocaleString('es-PE')} puntos GPS (origen: ${label}).`);
    } catch (err) {
      toast.error(err instanceof ApiError ? `No se pudo descargar el GPS: ${err.message}` : 'No se pudo descargar el GPS del viaje.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`d-inline-flex align-items-center gap-2 flex-wrap ${className}`}>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={download} disabled={busy}
              title="Descarga en CSV todos los puntos GPS que envió el conductor en este viaje">
        {busy
          ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
          : <i className="fa-solid fa-download me-1" aria-hidden="true" />}
        Descargar GPS original
      </button>
      {origin && <span className="small bugie-muted" role="status">Origen: {origin}</span>}
    </span>
  );
}
