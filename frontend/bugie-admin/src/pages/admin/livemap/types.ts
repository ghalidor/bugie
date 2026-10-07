import type { Tone } from '../../../components/ui';
import type { RouteDeviationEvent } from '../../../hooks/useMonitorHub';

// Tipos y utilidades del Monitoreo en vivo (LiveMap).

export interface OnlineDriver {
  id: string; userId: string; fullName: string;
  isOnline: boolean; hasActiveTrip: boolean;
  currentLat: number | null; currentLng: number | null;
  rating: number;
  profilePhotoUrl: string | null;
  /** Hora del último GPS recibido por SignalR (no viene en GET drivers/online). */
  lastGpsAt?: string | null;
  /** Velocidad del último GPS (km/h) recibida por SignalR. */
  speedKmh?: number | null;
  /** Teléfono del conductor (GET drivers/online; puede no venir). */
  phone?: string | null;
  /** Hora de la última posición guardada en el servidor (GET drivers/online; puede no venir). */
  lastLocationAt?: string | null;
}

export interface SosAlert {
  id: string;
  tripId: string;
  userId: string;
  lat: number; lng: number;
  userRole: string; createdAt: string;
}

export interface VehicleBulk {
  driverUserId: string;
  plate: string; brand: string; model: string; color: string;
  photoUrl: string | null;
}

/// Pasajeros con viaje activo. Trae nombres + origen/destino + posición
/// del conductor para el detalle.
export interface LivePassenger {
  tripId: string;
  passengerId: string;
  driverId: string | null;
  status: number;
  lat: number;
  lng: number;
  updatedAt: string | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  driverLat: number | null;
  driverLng: number | null;
  passengerName: string;
  passengerPhone: string | null;
  passengerPhotoUrl: string | null;
  driverName: string | null;
  driverPhone: string | null;
  /** 0 = viaje, 1 = envío. Opcional: hoy GET trips/live-passengers no lo envía. */
  serviceType?: number;
  /** Inicio del viaje (pasajero a bordo). Opcional: hoy GET trips/live-passengers no lo envía. */
  startedAt?: string | null;
  /** false = el pasajero no envía GPS y lat/lng son las del punto de recojo. Sin dato = se asume que sí. */
  passengerLocationKnown?: boolean;
}

/** El pasajero no envía GPS: su pin está en el punto de recojo. */
export const paxLocationUnknown = (p: LivePassenger | null | undefined) => p?.passengerLocationKnown === false;
export const PAX_AT_PICKUP_TEXT = 'Ubicación del pasajero: punto de recojo (no envía GPS)';

/// Alerta de desvío de ruta. La detección la hace el backend (Trips.Api)
/// contra la ruta planificada (GraphHopper) con cada GPS del conductor;
/// aquí solo se muestran las alertas (GET al cargar + eventos SignalR).
export type RouteDeviation = RouteDeviationEvent;

/// Estado de un viaje activo (status del backend).
export const LIVE_TRIP_STATUS: Record<number, { text: string; tone: Tone }> = {
  1: { text: 'Buscando conductor',  tone: 'warn' },
  2: { text: 'En camino al recojo', tone: 'info' },
  3: { text: 'Viaje en curso',      tone: 'primary' },
  6: { text: 'SOS activo',          tone: 'bad' },
  7: { text: 'Negociando tarifa',   tone: 'warn' },
};
export const liveTripStatus = (s: number) => LIVE_TRIP_STATUS[s] ?? { text: 'En viaje', tone: 'neutral' as Tone };

export const roleLabel = (role: string) => (role === 'passenger' ? 'Pasajero' : 'Conductor');

/// "hace 5 min", "hace 3 h" o "hace 7 días" a partir de una fecha del backend (hora de Perú).
export function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

export const fmtHour = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

/// Solo la hora si es de hoy; si no, fecha corta y hora ("26 sep., 10:05 a. m.").
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? fmtHour(iso)
    : d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-PE');

/* ── Alertas de seguimiento (backend: Trips.Api, monitor-alerts) ─────────── */

export type MonitorAlertType = 'no_signal' | 'long_stop' | 'trip_delayed';

/// Alerta automática de seguimiento de un viaje en curso: sin señal GPS,
/// detenido mucho tiempo o demorado frente a lo estimado.
export interface MonitorAlert {
  id: string;
  tripId: string;
  driverId: string;
  driverName?: string | null;
  passengerName?: string | null;
  type: MonitorAlertType | string;
  startedAt: string;
  lastSeenAt?: string | null;
  resolvedAt?: string | null;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  /** Minutos del problema (sin señal / detenido / duración del viaje si está demorado). */
  minutes: number;
  /** Datos extra del backend (p. ej. minutos estimados del viaje demorado). */
  details?: unknown;
}

export const MONITOR_ALERT_META: Record<MonitorAlertType, { label: string; icon: string; tone: Tone }> = {
  no_signal:    { label: 'Sin señal',         icon: 'fa-satellite-dish', tone: 'neutral' },
  long_stop:    { label: 'Detenido',          icon: 'fa-circle-pause',   tone: 'warn' },
  trip_delayed: { label: 'Viaje demorado',    icon: 'fa-stopwatch',      tone: 'warn' },
};

export const monitorAlertMeta = (type: string) =>
  MONITOR_ALERT_META[type as MonitorAlertType] ?? { label: 'Alerta de seguimiento', icon: 'fa-bell', tone: 'warn' as Tone };

/** Minutos estimados del viaje que trae `details` (objeto, JSON o número). null si no viene. */
export function estimatedMinutes(details: unknown): number | null {
  let d: unknown = details;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return null; }
  }
  if (typeof d === 'number') return Number.isFinite(d) ? Math.round(d) : null;
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  for (const k of ['estimatedMinutes', 'estimatedMin', 'expectedMinutes', 'expectedMin', 'estimated']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  }
  return null;
}

/// "Sin señal hace 4 min", "Detenido 6 min", "Demorado: 32 min (estimado 18)".
/// Sin señal se calcula con la hora del último GPS si viene (sigue contando).
export function monitorAlertText(a: Pick<MonitorAlert, 'type' | 'minutes' | 'lastSeenAt' | 'details'>, nowMs = Date.now()): string {
  let min = Math.max(0, Math.round(a.minutes ?? 0));
  if (a.type === 'no_signal' && a.lastSeenAt) {
    const t = new Date(a.lastSeenAt).getTime();
    if (Number.isFinite(t)) min = Math.max(min, Math.round((nowMs - t) / 60000));
  }
  if (a.type === 'no_signal') return `Sin señal hace ${min} min`;
  if (a.type === 'long_stop') return `Detenido ${min} min`;
  if (a.type === 'trip_delayed') {
    const est = estimatedMinutes(a.details);
    return `Demorado: ${min} min${est != null ? ` (estimado ${est})` : ''}`;
  }
  return `${monitorAlertMeta(a.type).label} · ${min} min`;
}
