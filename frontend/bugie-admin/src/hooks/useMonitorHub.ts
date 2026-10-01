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
  tripId: string;
  userId: string;
  userRole: string;
  lat: number;
  lng: number;
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
