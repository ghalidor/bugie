import type { Tone } from '../../../components/ui';
import type { RouteDeviationEvent } from '../../../hooks/useMonitorHub';

// Tipos y utilidades del Monitoreo en vivo (LiveMap).

export interface OnlineDriver {
  id: string; userId: string; fullName: string;
  isOnline: boolean; hasActiveTrip: boolean;
  currentLat: number | null; currentLng: number | null;
  rating: number;
  profilePhotoUrl: string | null;
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
}

/// Alerta de desvío de ruta. La detección la hace el backend (Trips.Api)
/// contra la ruta planificada (GraphHopper) con cada GPS del conductor;
/// aquí solo se muestran las alertas (GET al cargar + eventos SignalR).
export type RouteDeviation = RouteDeviationEvent;

/// Estado de un viaje activo (status del backend).
export const LIVE_TRIP_STATUS: Record<number, { text: string; tone: Tone }> = {
  1: { text: 'Buscando conductor',  tone: 'warn' },
  2: { text: 'Conductor en camino', tone: 'info' },
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
