import { DRIVER_COLORS, MapLine } from '../../../components/BugieMapAdmin';
import type { PlannedRoute } from '../../../components/tripRoutes';
import { haversineKm, LiveTrail } from './useLiveTrails';
import { LivePassenger } from './types';

/*
 * Qué se dibuja de cada viaje según su estado (Monitoreo y detalle en vivo):
 *
 *   Buscando conductor (1/7) → solo el pasajero en el punto de recojo.
 *   En camino al recojo (2)  → auto + pasajero esperando + punteada auto→recojo
 *                              + lo ya recorrido en gris fino.
 *   En viaje (3) / SOS (6)   → solo el auto (el pasajero va dentro) + bandera de
 *                              destino + línea sólida desde el inicio del viaje
 *                              + punteada de lo que falta hasta el destino.
 */

export type Pt = [number, number];
export type TripPhase = 'searching' | 'pickup' | 'onboard';

/** Colores del monitoreo (pines, líneas, filtros y leyenda usan los mismos). */
export const SCENE_COLORS = {
  ...DRIVER_COLORS,
  traveled:  '#94a3b8', // ya recorrido camino al recojo (gris suave)
  passenger: '#f97316', // pasajero esperando / buscando conductor
  noSignal:  '#64748b',
  alert:     '#f59e0b', // alerta de seguimiento abierta (borde ámbar)
  delivery:  '#d97706',
  neutral:   '#64748b',
} as const;

/** Fase del viaje según su status del backend (null = no se dibuja). */
export function tripPhase(status: number): TripPhase | null {
  if (status === 1 || status === 7) return 'searching';
  if (status === 2) return 'pickup';
  if (status === 3 || status === 6) return 'onboard';
  return null;
}

/** Color de las líneas / bandera de un viaje. */
export function tripColor(phase: TripPhase | null, sos: boolean, deviated: boolean): string {
  if (sos) return SCENE_COLORS.sos;
  if (deviated) return SCENE_COLORS.deviated;
  return phase === 'pickup' ? SCENE_COLORS.enRoute : SCENE_COLORS.inTrip;
}

const validPt = (lat: number | null | undefined, lng: number | null | undefined): boolean =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

const km = (a: Pt, b: Pt) => haversineKm(a[0], a[1], b[0], b[1]);

/** Largo (km) de una línea. */
export function pathKm(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += km(pts[i - 1], pts[i]);
  return total;
}

/** Radio (km) alrededor del recojo en el que se considera que el auto "llegó". */
const PICKUP_NEAR_KM = 0.12;
/** Si nunca pasó tan cerca, se usa el punto más cercano siempre que esté a menos de esto. */
const PICKUP_FALLBACK_KM = 0.4;
/** Más lejos que esto de la ruta planificada, lo que falta se dibuja en línea recta. */
const OFF_ROUTE_KM = 0.6;

/**
 * Recorrido desde el inicio del viaje (pasajero a bordo):
 *  - Con startedAt y horas por punto: desde el último punto anterior al inicio.
 *  - Sin ese dato: desde que el auto deja el punto de recojo (último punto del
 *    primer paso cerca del recojo).
 *  - Si no se puede saber, el recorrido completo.
 */
export function trimToTripStart(points: Pt[], times: number[], origin: Pt | null, startedAt?: string | null): Pt[] {
  if (points.length < 2) return points;

  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  if (Number.isFinite(startMs) && times.length === points.length) {
    const i = times.findIndex(t => t >= startMs);
    if (i === -1) return points.slice(-1);
    return i > 0 ? points.slice(i - 1) : points;
  }

  if (!origin) return points;
  let first = -1;
  for (let i = 0; i < points.length; i++) {
    if (km(points[i], origin) <= PICKUP_NEAR_KM) { first = i; break; }
  }
  if (first === -1) {
    let best = -1, bestKm = Infinity;
    points.forEach((p, i) => { const d = km(p, origin); if (d < bestKm) { bestKm = d; best = i; } });
    return bestKm <= PICKUP_FALLBACK_KM ? points.slice(best) : points;
  }
  let last = first;
  while (last + 1 < points.length && km(points[last + 1], origin) <= PICKUP_NEAR_KM) last++;
  return points.slice(last);
}

/**
 * Lo que falta por recorrer desde la posición actual: la ruta planificada
 * desde su punto más cercano al auto, o una recta si no hay ruta o el auto
 * está lejos de ella.
 */
export function remainingPath(route: Pt[] | null | undefined, from: Pt, to: Pt): { points: Pt[]; byRoute: boolean } {
  if (!route || route.length < 2) return { points: [from, to], byRoute: false };
  let k = 0, best = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = km(route[i], from);
    if (d < best) { best = d; k = i; }
  }
  if (best > OFF_ROUTE_KM) return { points: [from, to], byRoute: false };
  // Si el auto ya pasó el punto más cercano, se arranca desde el siguiente.
  if (k + 1 < route.length && km(from, route[k + 1]) < km(route[k], route[k + 1])) k++;
  const pts = [from, ...route.slice(k)];
  return { points: pts.length >= 2 ? pts : [from, to], byRoute: pts.length >= 2 };
}

export interface TripScene {
  phase: TripPhase | null;
  color: string;
  /** Posición del auto (null si aún no tiene GPS). */
  driverPos: Pt | null;
  /** Pin del pasajero (solo buscando conductor o esperando en el recojo). */
  paxPos: Pt | null;
  /** Punto de recojo (origen del viaje). */
  pickupPos: Pt | null;
  /** Destino del viaje. */
  destPos: Pt | null;
  /** Lo ya recorrido: gris (camino al recojo) o del color del viaje (en viaje). */
  traveled: Pt[];
  traveledKm: number;
  /** Lo que falta (auto → recojo o auto → destino). */
  remaining: Pt[];
  remainingKm: number;
  /** true si lo que falta sigue la ruta planificada; false = línea recta. */
  remainingByRoute: boolean;
  /** Distancia en línea recta del auto al recojo o al destino. */
  straightKm: number | null;
}

interface SceneInput {
  trip: LivePassenger;
  driverPos: Pt | null;
  trail: LiveTrail | null;
  planned: PlannedRoute | null;
  sos: boolean;
  deviated: boolean;
}

const EMPTY: Pt[] = [];

export function buildTripScene({ trip, driverPos, trail, planned, sos, deviated }: SceneInput): TripScene {
  const phase = tripPhase(trip.status);
  const color = tripColor(phase, sos, deviated);
  const pickup: Pt | null = validPt(trip.originLat, trip.originLng) ? [trip.originLat, trip.originLng]
    : validPt(trip.lat, trip.lng) ? [trip.lat, trip.lng] : null;
  const dest: Pt | null = validPt(trip.destLat, trip.destLng) ? [trip.destLat, trip.destLng] : null;
  const base: TripScene = {
    phase, color, driverPos, paxPos: null, pickupPos: pickup, destPos: dest,
    traveled: EMPTY, traveledKm: 0, remaining: EMPTY, remainingKm: 0, remainingByRoute: false, straightKm: null,
  };

  if (phase === 'searching') return { ...base, paxPos: pickup };

  if (phase === 'pickup') {
    const traveled = trail?.points ?? EMPTY;
    const rem = driverPos && pickup ? remainingPath(planned?.pickup?.points, driverPos, pickup) : null;
    return {
      ...base, paxPos: pickup,
      traveled, traveledKm: trail?.distanceKm ?? 0,
      remaining: rem?.points ?? EMPTY, remainingKm: rem ? pathKm(rem.points) : 0, remainingByRoute: !!rem?.byRoute,
      straightKm: driverPos && pickup ? km(driverPos, pickup) : null,
    };
  }

  if (phase === 'onboard') {
    const traveled = trail ? trimToTripStart(trail.points, trail.times, pickup, trip.startedAt) : EMPTY;
    const rem = driverPos && dest ? remainingPath(planned?.trip?.points, driverPos, dest) : null;
    return {
      ...base,
      traveled, traveledKm: pathKm(traveled),
      remaining: rem?.points ?? EMPTY, remainingKm: rem ? pathKm(rem.points) : 0, remainingByRoute: !!rem?.byRoute,
      straightKm: driverPos && dest ? km(driverPos, dest) : null,
    };
  }

  return base;
}

/** Patrón de la línea "por recorrer". */
export const REMAINING_DASH = '8 10';

/**
 * Líneas de un viaje en orden de dibujo (lo que falta debajo, lo recorrido
 * encima). Los puntos conservan la referencia de la escena: el mapa no
 * redibuja una línea si su escena no cambió.
 */
export function sceneLines(idPrefix: string, sc: TripScene, opts: { emphasis?: boolean; dimmed?: boolean; warned?: boolean } = {}): MapLine[] {
  const { emphasis = false, dimmed = false, warned = false } = opts;
  const lines: MapLine[] = [];
  // Alerta de seguimiento abierta: borde ámbar debajo del trazo (se dibuja primero).
  if (warned) {
    const base = sc.traveled.length >= 2 ? sc.traveled : sc.remaining;
    if (base.length >= 2) {
      lines.push({ id: `${idPrefix}:warn`, points: base, color: SCENE_COLORS.alert, weight: emphasis ? 13 : 11, opacity: dimmed ? 0.15 : 0.55 });
    }
  }
  if (sc.remaining.length >= 2) {
    lines.push({
      id: `${idPrefix}:todo`, points: sc.remaining, color: sc.color, dashArray: REMAINING_DASH,
      weight: emphasis ? 5 : 4, opacity: dimmed ? 0.2 : 0.9,
    });
  }
  if (sc.traveled.length >= 2) {
    const pickup = sc.phase === 'pickup';
    lines.push({
      id: `${idPrefix}:done`, points: sc.traveled,
      color: pickup ? SCENE_COLORS.traveled : sc.color,
      weight: pickup ? (emphasis ? 4 : 3) : (emphasis ? 7 : 5),
      opacity: dimmed ? 0.15 : pickup ? 0.75 : 0.9,
    });
  }
  return lines;
}

/** "1,2 km" */
export const fmtKm = (v: number) =>
  `${v.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;

/** Velocidad promedio (km/h) para estimar tiempos cuando no hay dato de velocidad. */
export const AVG_SPEED_KMH = 22;

/** Minutos estimados para recorrer `distKm` (con la velocidad actual si es útil). */
export function etaMinutes(distKm: number, speedKmh: number | null | undefined): { minutes: number; usedAverage: boolean } {
  const useSpeed = typeof speedKmh === 'number' && speedKmh >= 10;
  const v = useSpeed ? speedKmh! : AVG_SPEED_KMH;
  return { minutes: Math.max(1, Math.round((distKm / v) * 60)), usedAverage: !useSpeed };
}
