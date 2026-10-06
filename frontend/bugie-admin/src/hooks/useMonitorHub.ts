import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { useEffect, useRef } from 'react';
import { API } from '../state/api';
import { getToken } from '../state/session';

/// URL del hub. Quita el sufijo /api de la URL base de Trips porque el hub
/// se monta en la RAÍZ del servicio (app.MapHub("/hubs/monitor") en Program.cs),
/// no bajo /api.
function hubUrl(): string {
  const base = API.trips;
  const root = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${root}/hubs/monitor`;
}

export interface DriverLocationEvent {
  userId: string;
  lat: number;
  lng: number;
  hasActiveTrip: boolean;
  /// Viaje activo del conductor (lo resuelve Trips.Api); null si no tiene viaje.
  /// Con esto el monitoreo agrega el punto al recorrido en vivo de ese viaje.
  tripId: string | null;
  heading: number | null;
  speedKmh: number | null;
  at: string;
}

export interface PassengerLocationEvent {
  userId: string;
  tripId: string;
  lat: number;
  lng: number;
  at: string;
}

export interface SosEvent {
  /// Id del aviso guardado en el historial (null si no se guardó).
  notificationId?: string | null;
  alertId?: string | null;
  /// Texto del aviso armado por el backend (incluye nombre y rol).
  title?: string;
  message?: string;
  tripId: string;
  userId: string;
  userRole: string;
  lat: number;
  lng: number;
}

/// Alerta de desvío de ruta detectada en el backend (Trips.Api).
export interface RouteDeviationEvent {
  /// Id del aviso guardado en el historial (solo en deviation:new).
  notificationId?: string | null;
  id: string;
  tripId: string;
  driverId: string;
  leg: string;
  lat: number;
  lng: number;
  distanceM: number;
  maxDistanceM: number;
  status: 'open' | 'closed';
  closeReason: string | null;
  startedAt: string;
  endedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/// Aviso para el Centro de avisos (POST /api/internal/admin-events en Trips).
export interface AdminEvent {
  /// Id del aviso guardado en el historial (null si no se guardó).
  notificationId: string | null;
  type: string;
  title: string;
  message: string;
  link: string;
  /// Permiso que debe tener el admin para verlo ('' = cualquiera).
  permission: string;
  createdAt: string;
}

interface UseMonitorHubOpts {
  /// Alerta SOS nueva. Admin debería refrescar.
  onSos?: (payload: SosEvent) => void;
  /// Nueva posición de un conductor (broadcast por GPS push).
  /// El admin debería actualizar SOLO ese pin en el mapa sin recargar todo.
  onDriverLocation?: (payload: DriverLocationEvent) => void;
  /// Nueva posición de un pasajero en viaje activo.
  onPassengerLocation?: (payload: PassengerLocationEvent) => void;
  /// Un conductor se desconectó (sacarlo del mapa).
  onDriverOffline?: (payload: { userId: string }) => void;
  /// Alerta de desvío de ruta: kind = new (se abrió), closed (volvió a la
  /// ruta o terminó el viaje), reviewed (un admin la revisó).
  onDeviation?: (kind: 'new' | 'closed' | 'reviewed', payload: RouteDeviationEvent) => void;
  /// Aviso general para el Centro de avisos ("admin:event").
  onAdminEvent?: (payload: AdminEvent) => void;
}

/// Hook que mantiene una conexión SignalR al hub /hubs/monitor.
/// Se conecta al montar, se desconecta al desmontar.
/// Maneja reconexión automática (built-in de signalr-js).
/// Si no hay token (no logueado), no intenta conectarse.
///
/// Diseño: los callbacks se guardan en refs para que el padre pueda cambiarlos
/// (re-renderizar) sin recrear la conexión (sino se desconecta/reconecta cada
/// vez que el componente re-renderiza, lo que causa parpadeos y pérdida de
/// mensajes durante la reconexión).
export function useMonitorHub(opts: UseMonitorHubOpts) {
  const connRef = useRef<HubConnection | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const conn = new HubConnectionBuilder()
      .withUrl(`${hubUrl()}?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    // ── Handlers de eventos del backend ──────────────────────────────────
    conn.on('sos:new', (payload: any) => {
      try {
        optsRef.current.onSos?.({
          notificationId: payload?.notificationId ? String(payload.notificationId) : null,
          alertId:  payload?.alertId ? String(payload.alertId) : null,
          title:    payload?.title ? String(payload.title) : undefined,
          message:  payload?.message ? String(payload.message) : undefined,
          tripId:   payload.tripId,
          userId:   payload.userId,
          userRole: payload.userRole ?? 'unknown',
          lat:      payload.lat,
          lng:      payload.lng,
        });
      } catch (e) { console.warn('Error procesando sos:new', e); }
    });

    conn.on('driver:location', (payload: any) => {
      try {
        optsRef.current.onDriverLocation?.({
          userId:        payload.userId,
          lat:           payload.lat,
          lng:           payload.lng,
          hasActiveTrip: !!payload.hasActiveTrip,
          tripId:        payload.tripId ? String(payload.tripId) : null,
          heading:       typeof payload.heading === 'number' ? payload.heading : null,
          speedKmh:      typeof payload.speedKmh === 'number' ? payload.speedKmh : null,
          at:            payload.at,
        });
      } catch (e) { console.warn('Error procesando driver:location', e); }
    });

    conn.on('passenger:location', (payload: any) => {
      try {
        optsRef.current.onPassengerLocation?.({
          userId: payload.userId,
          tripId: payload.tripId,
          lat:    payload.lat,
          lng:    payload.lng,
          at:     payload.at,
        });
      } catch (e) { console.warn('Error procesando passenger:location', e); }
    });

    conn.on('driver:offline', (payload: any) => {
      try {
        optsRef.current.onDriverOffline?.({ userId: payload.userId });
      } catch (e) { console.warn('Error procesando driver:offline', e); }
    });

    (['new', 'closed', 'reviewed'] as const).forEach(kind => {
      conn.on(`deviation:${kind}`, (payload: RouteDeviationEvent) => {
        try {
          optsRef.current.onDeviation?.(kind, payload);
        } catch (e) { console.warn(`Error procesando deviation:${kind}`, e); }
      });
    });

    conn.on('admin:event', (payload: any) => {
      try {
        optsRef.current.onAdminEvent?.({
          notificationId: payload?.notificationId ? String(payload.notificationId) : null,
          type:       String(payload?.type ?? ''),
          title:      String(payload?.title ?? ''),
          message:    String(payload?.message ?? ''),
          link:       String(payload?.link ?? ''),
          permission: String(payload?.permission ?? ''),
          createdAt:  String(payload?.createdAt ?? ''),
        });
      } catch (e) { console.warn('Error procesando admin:event', e); }
    });

    conn.start()
      .then(() => console.info('SignalR conectado al hub /monitor'))
      .catch(err => console.warn('SignalR: no se pudo conectar:', err));

    connRef.current = conn;

    return () => {
      if (connRef.current && connRef.current.state !== HubConnectionState.Disconnected) {
        connRef.current.stop().catch(() => {});
      }
      connRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
