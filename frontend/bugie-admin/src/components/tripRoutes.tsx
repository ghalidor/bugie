import { MapLine, ROUTE_COLORS } from './BugieMapAdmin';
import { API, apiFetch } from '../state/api';

/* ──────────────────────────────────────────────────────────────────────────
   Rutas de un viaje para los mapas del admin (detalle del viaje y Monitoreo):
   - Ruta del sistema: GET /api/trips/admin/trips/{id}/planned-route
     (trip = origen → destino; pickup = tramo de recogida del conductor).
   - Recorrido real: GET /api/drivers/admin/trips/{id}/path (GPS grabado).
   Se dibujan con BugieMapAdmin `lines` y se explican con <RouteLegend />.
   ────────────────────────────────────────────────────────────────────────── */

export interface RouteLeg { source: string; points: [number, number][]; distanceMeters: number }
export interface PlannedRoute {
  pickup: RouteLeg | null;
  trip: RouteLeg | null;
  origin: { lat: number; lng: number; address: string } | null;
  destination: { lat: number; lng: number; address: string } | null;
  stops: { lat: number; lng: number; address: string }[];
}

export interface PathPoint { lat: number; lng: number; speedKmh: number | null; heading: number | null; recordedAt: string }
export interface TripPath { tripId: string; points: number; distanceKm: number; firstAt: string | null; lastAt: string | null; path: PathPoint[] }

export const fetchPlannedRoute = (tripId: string) =>
  apiFetch<PlannedRoute>(`${API.trips}/trips/admin/trips/${tripId}/planned-route`);

export const fetchTripPath = (tripId: string) =>
  apiFetch<TripPath>(`${API.drivers}/drivers/admin/trips/${tripId}/path`);

const validLeg = (l: RouteLeg | null | undefined): l is RouteLeg => !!l && Array.isArray(l.points) && l.points.length >= 2;

/** Líneas en orden de dibujo: recogida (tenue), sistema (azul punteado) y real (verde, encima). */
export function buildRouteLines(planned: PlannedRoute | null, path: TripPath | null): MapLine[] {
  const lines: MapLine[] = [];
  if (validLeg(planned?.pickup)) {
    lines.push({ id: 'pickup', points: planned!.pickup!.points, color: ROUTE_COLORS.pickup, weight: 4, opacity: 0.7, dashArray: '4 8' });
  }
  if (validLeg(planned?.trip)) {
    lines.push({ id: 'planned', points: planned!.trip!.points, color: ROUTE_COLORS.planned, weight: 4, opacity: 0.9, dashArray: '10 8' });
  }
  if (path && path.path.length >= 2) {
    lines.push({ id: 'real', points: path.path.map(p => [p.lat, p.lng] as [number, number]), color: ROUTE_COLORS.real, weight: 6, opacity: 0.9 });
  }
  return lines;
}

const km = (meters: number) => `${(meters / 1000).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
const kmFromKm = (v: number) => `${v.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

interface LegendProps {
  planned: PlannedRoute | null;
  path: TripPath | null;
  /** Recorrido ya resumido (p. ej. el trazo en vivo del Monitoreo); si viene, se usa en lugar de `path`. */
  real?: { distanceKm: number; points: number } | null;
  /** Mientras carga se muestra "Cargando…". */
  loadingPlanned?: boolean;
  loadingPath?: boolean;
  /** Versión más pequeña (Monitoreo). */
  compact?: boolean;
  /** Texto del recorrido real ("Recorrido real" / "Recorrido hasta ahora"). */
  realLabel?: string;
}

/** Leyenda bajo el mapa: muestra de color + nombre + distancia (o estado vacío). */
export function RouteLegend({ planned, path, real, loadingPlanned, loadingPath, compact, realLabel = 'Recorrido real' }: LegendProps) {
  const hasPlanned = validLeg(planned?.trip);
  const summary = real ?? (path ? { distanceKm: path.distanceKm, points: path.path.length } : null);
  const hasReal = !!summary && summary.points >= 2;
  const hasPickup = validLeg(planned?.pickup);
  const straight = hasPlanned && planned!.trip!.source === 'straight';

  return (
    <ul className={`bx-route-legend ${compact ? 'is-compact' : ''}`} aria-label="Leyenda del mapa">
      <li className={hasPlanned ? '' : 'is-empty'}>
        <span className="sw dashed" style={{ color: ROUTE_COLORS.planned }} aria-hidden="true" />
        <span className="t">
          {loadingPlanned ? 'Ruta del sistema · cargando…'
            : hasPlanned ? <>Ruta del sistema · <strong>{km(planned!.trip!.distanceMeters)}</strong>{straight && <span className="bugie-muted"> (línea recta)</span>}</>
            : 'Ruta del sistema · sin ruta guardada'}
        </span>
      </li>
      <li className={hasReal ? '' : 'is-empty'}>
        <span className="sw solid" style={{ color: ROUTE_COLORS.real }} aria-hidden="true" />
        <span className="t">
          {loadingPath ? `${realLabel} · cargando…`
            : hasReal ? <>{realLabel} · <strong>{kmFromKm(summary!.distanceKm)}</strong></>
            : `${realLabel} · sin recorrido registrado`}
        </span>
      </li>
      {hasPickup && (
        <li>
          <span className="sw dotted" style={{ color: ROUTE_COLORS.pickup }} aria-hidden="true" />
          <span className="t">Tramo de recogida · <strong>{km(planned!.pickup!.distanceMeters)}</strong></span>
        </li>
      )}
    </ul>
  );
}
