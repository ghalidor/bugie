import { useEffect, useRef, useState } from 'react';
import { API, apiFetch } from '../state/api';
import { useTripsHub } from './useTripsHub';

const POLL_MS = 60_000;

/**
 * ¿El conductor tiene un viaje activo (aceptado, en curso o SOS)? Lo usa el
 * menú para mostrar "Viaje en curso" solo cuando hay uno. Se actualiza al
 * llegar TripChanged por el hub (grupo del usuario), al reconectar, al
 * cambiar de página y, de respaldo, cada minuto.
 */
export function useDriverActiveTrip(enabled: boolean, path: string): boolean {
  const [active, setActive] = useState(false);
  const loadRef = useRef<() => void>(() => {});

  loadRef.current = () => {
    if (!enabled) { setActive(false); return; }
    apiFetch<{ id: string; status: number } | null>(`${API.trips}/trips/active`)
      .then(t => setActive(!!t && (t.status === 2 || t.status === 3 || t.status === 6)))
      .catch(() => { /* sin red: se mantiene lo último conocido */ });
  };

  useTripsHub({
    onTripChanged: () => loadRef.current(),
    onReconnected: () => loadRef.current(),
  });

  useEffect(() => { loadRef.current(); }, [enabled, path]);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => loadRef.current(), POLL_MS);
    return () => clearInterval(t);
  }, [enabled]);

  return active;
}
