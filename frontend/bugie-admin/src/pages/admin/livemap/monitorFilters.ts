import { storage } from '../../../components/ui';
import type { LiveTrail } from './useLiveTrails';
import type { OnlineDriver } from './types';
import { SCENE_COLORS } from './tripScene';

/*
 * Filtros rápidos del Monitoreo (chips sobre el mapa). Se combinan entre sí
 * (muestra lo que cumpla CUALQUIERA de los elegidos) y con las capas.
 * Sin ninguno elegido se ve todo. La selección se recuerda en el navegador.
 */

export type MonitorFilter = 'available' | 'enRoute' | 'inTrip' | 'delivery' | 'searching' | 'deviated' | 'sos' | 'noSignal';

export const MONITOR_FILTERS: Array<{ key: MonitorFilter; label: string; color: string; hint: string }> = [
  { key: 'available', label: 'Disponibles',        color: SCENE_COLORS.available, hint: 'Conductores en línea sin viaje' },
  { key: 'enRoute',   label: 'En camino',          color: SCENE_COLORS.enRoute,   hint: 'Conductor yendo al punto de recojo' },
  { key: 'inTrip',    label: 'En viaje',           color: SCENE_COLORS.inTrip,    hint: 'Pasajero a bordo' },
  { key: 'delivery',  label: 'Envíos',             color: SCENE_COLORS.delivery,  hint: 'Envíos activos' },
  { key: 'searching', label: 'Buscando conductor', color: SCENE_COLORS.passenger, hint: 'Pasajeros esperando que un conductor acepte' },
  { key: 'deviated',  label: 'Desviados',          color: SCENE_COLORS.deviated,  hint: 'Fuera de la ruta planificada' },
  { key: 'sos',       label: 'SOS',                color: SCENE_COLORS.sos,       hint: 'Con alerta SOS activa' },
  { key: 'noSignal',  label: 'Sin señal',          color: SCENE_COLORS.noSignal,  hint: 'Con viaje y sin GPS hace más de 2 min, o con alerta «Sin señal» abierta' },
];

/** Sin GPS por más de esto (con viaje) = "Sin señal". */
export const NO_SIGNAL_MS = 2 * 60_000;

const STORAGE_KEY = 'bugie.admin.monitor.filters';

export function loadFilters(): MonitorFilter[] {
  try {
    const raw = storage.get(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const valid = new Set(MONITOR_FILTERS.map(f => f.key));
    return Array.isArray(list) ? list.filter((k): k is MonitorFilter => valid.has(k)) : [];
  } catch {
    return [];
  }
}

export function saveFilters(list: MonitorFilter[]) {
  try { storage.set(STORAGE_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
}

/** Hora (ms) del último GPS conocido del conductor: SignalR, recorrido grabado o la que guarda el servidor. */
export function lastSeenMs(driver: OnlineDriver | null | undefined, trail: LiveTrail | null | undefined): number | null {
  const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
  const v = Math.max(...[ms(driver?.lastGpsAt), ms(trail?.lastAt), ms(driver?.lastLocationAt)]
    .map(x => (Number.isFinite(x) ? x : -Infinity)));
  return Number.isFinite(v) ? v : null;
}

/** true si se conoce la última posición y es más vieja que NO_SIGNAL_MS. */
export const isStale = (seenMs: number | null, nowMs: number) => seenMs !== null && nowMs - seenMs > NO_SIGNAL_MS;
