import { useEffect, useRef, useState } from 'react';
import {
  DriverLocationEvent, HubStatus, ProposalsChangedEvent, RequestsChangedEvent,
  TripChangedEvent, UserNotificationEvent, tripsHub,
} from '../state/tripsHub';

export type {
  DriverLocationEvent, HubStatus, ProposalsChangedEvent, RequestsChangedEvent,
  TripChangedEvent, UserNotificationEvent,
};

export interface TripsHubHandlers {
  onTripChanged?:      (e: TripChangedEvent) => void;
  onProposalsChanged?: (e: ProposalsChangedEvent) => void;
  onDriverLocation?:   (e: DriverLocationEvent) => void;
  onRequestsChanged?:  (e: RequestsChangedEvent) => void;
  onUserNotification?: (e: UserNotificationEvent) => void;
  /// La conexión volvió tras una caída: hacer una recarga completa.
  onReconnected?:      () => void;
}

/**
 * Suscribe la pantalla al hub compartido /hubs/trips (una sola conexión por
 * sesión, ver state/tripsHub.ts). Los handlers se guardan en refs para que el
 * componente pueda re-renderizar sin re-suscribirse.
 *
 * Devuelve el estado de la conexión y joinTrip/leaveTrip. Si `connected` es
 * false la pantalla debe seguir con su polling normal.
 */
export function useTripsHub(handlers: TripsHubHandlers = {}) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });

  const [status, setStatus] = useState<HubStatus>(tripsHub.status);

  useEffect(() => {
    const release = tripsHub.acquire();
    setStatus(tripsHub.status);
    const offs = [
      tripsHub.onStatus(setStatus),
      tripsHub.on('TripChanged',      e => ref.current.onTripChanged?.(e)),
      tripsHub.on('ProposalsChanged', e => ref.current.onProposalsChanged?.(e)),
      tripsHub.on('DriverLocation',   e => ref.current.onDriverLocation?.(e)),
      tripsHub.on('RequestsChanged',  e => ref.current.onRequestsChanged?.(e)),
      tripsHub.on('UserNotification', e => ref.current.onUserNotification?.(e)),
      tripsHub.on('reconnected',      () => ref.current.onReconnected?.()),
    ];
    return () => {
      offs.forEach(off => off());
      release();
    };
  }, []);

  return {
    status,
    connected: status === 'connected',
    joinTrip:  tripsHub.joinTrip,
    leaveTrip: tripsHub.leaveTrip,
  };
}
