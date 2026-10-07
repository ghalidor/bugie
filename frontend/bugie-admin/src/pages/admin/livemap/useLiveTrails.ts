import { useCallback, useEffect, useRef, useState } from 'react';
import { PlannedRoute, fetchPlannedRoute, fetchTripPath } from '../../../components/tripRoutes';
import { LivePassenger } from './types';

/*
 * Recorridos en vivo de los viajes activos (Monitoreo).
 *
 * Por cada viaje con conductor asignado (en camino al recojo, en curso o con
 * SOS) se guarda el trazo recorrido:
 *   1. Al aparecer el viaje se pide UNA vez el recorrido grabado
 *      (GET drivers/admin/trips/{id}/path) y la ruta planificada.
 *   2. Cada GPS del conductor que llega por SignalR ("driver:location" con
 *      tripId) se AGREGA al final del trazo, sin volver a pedir todo.
 *   3. Cada TRAIL_REFRESH_MS se vuelve a pedir el recorrido completo como
 *      respaldo (por si se perdieron eventos del hub).
 *
 * Solo cambia la referencia del viaje afectado: el mapa actualiza esa
 * polilínea y deja las demás como están.
 */

/** Cada cuánto se vuelve a pedir el recorrido completo (respaldo). */
export const TRAIL_REFRESH_MS = 60_000;

/** Estados de viaje con conductor en movimiento: en camino (2), en curso (3), SOS (6). */
export const isTrailStatus = (status: number) => status === 2 || status === 3 || status === 6;

export interface LiveTrail {
  tripId: string;
  driverId: string | null;
  /** [[lat, lng], ...] en orden cronológico. */
  points: [number, number][];
  /** Hora (ms) de cada punto, en paralelo a `points` (0 si no se conoce). */
  times: number[];
  distanceKm: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Ya se pidió el recorrido grabado al menos una vez. */
  loaded: boolean;
  /** Ruta planificada (origen → destino y tramo de recogida); null si no hay. */
  planned: PlannedRoute | null;
}

/** Punto que llegó por el hub y aún no está confirmado en el recorrido grabado. */
interface TailPoint { lat: number; lng: number; atMs: number }

/** Distancia (km) entre dos coordenadas. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const emptyTrail = (tripId: string, driverId: string | null): LiveTrail =>
  ({ tripId, driverId, points: [], times: [], distanceKm: 0, firstAt: null, lastAt: null, loaded: false, planned: null });

export function useLiveTrails(passengers: LivePassenger[]) {
  const [byTrip, setByTrip] = useState<Record<string, LiveTrail>>({});
  const byTripRef = useRef(byTrip);
  byTripRef.current = byTrip;
  // Puntos en vivo por viaje que todavía no están en el recorrido grabado.
  const tailsRef = useRef<Record<string, TailPoint[]>>({});

  /** Pide el recorrido grabado y lo combina con los puntos en vivo más nuevos. */
  const loadPath = useCallback(async (tripId: string) => {
    try {
      const p = await fetchTripPath(tripId);
      const serverLastMs = p.lastAt ? new Date(p.lastAt).getTime() : 0;
      const tail = (tailsRef.current[tripId] ?? []).filter(t => t.atMs > serverLastMs);
      tailsRef.current[tripId] = tail;

      const points = p.path.map(pt => [pt.lat, pt.lng] as [number, number]);
      const times = p.path.map(pt => new Date(pt.recordedAt).getTime() || 0);
      let distanceKm = p.distanceKm;
      let last = points[points.length - 1];
      tail.forEach(t => {
        if (last) distanceKm += haversineKm(last[0], last[1], t.lat, t.lng);
        last = [t.lat, t.lng];
        points.push(last);
        times.push(t.atMs);
      });
      const lastAt = tail.length ? new Date(tail[tail.length - 1].atMs).toISOString() : p.lastAt;

      setByTrip(prev => {
        const cur = prev[tripId];
        if (!cur) return prev; // el viaje terminó mientras cargaba
        return { ...prev, [tripId]: { ...cur, points, times, distanceKm, firstAt: p.firstAt, lastAt, loaded: true } };
      });
    } catch {
      // Se mantiene lo que había; el siguiente refresco lo intenta de nuevo.
      setByTrip(prev => (prev[tripId] && !prev[tripId].loaded ? { ...prev, [tripId]: { ...prev[tripId], loaded: true } } : prev));
    }
  }, []);

  /** Ruta planificada (una vez por viaje). */
  const loadPlanned = useCallback(async (tripId: string) => {
    try {
      const r = await fetchPlannedRoute(tripId);
      setByTrip(prev => (prev[tripId] ? { ...prev, [tripId]: { ...prev[tripId], planned: r ?? null } } : prev));
    } catch { /* sin ruta guardada: no se dibuja */ }
  }, []);

  // ── Alta/baja de viajes según la lista de viajes activos ───────────
  useEffect(() => {
    const active = passengers.filter(p => isTrailStatus(p.status) && p.driverId);
    const activeIds = new Set(active.map(p => p.tripId));
    const prev = byTripRef.current;
    const added: string[] = [];
    let changed = false;

    const next: Record<string, LiveTrail> = {};
    active.forEach(p => {
      const cur = prev[p.tripId];
      if (!cur) { next[p.tripId] = emptyTrail(p.tripId, p.driverId); added.push(p.tripId); changed = true; }
      else if (cur.driverId !== p.driverId) { next[p.tripId] = { ...cur, driverId: p.driverId }; changed = true; }
      else next[p.tripId] = cur;
    });
    Object.keys(prev).forEach(id => {
      if (!activeIds.has(id)) { changed = true; delete tailsRef.current[id]; }
    });
    if (!changed) return;

    byTripRef.current = next;
    setByTrip(next);
    added.forEach(id => { loadPath(id); loadPlanned(id); });
  }, [passengers, loadPath, loadPlanned]);

  // ── Refresco de respaldo del recorrido completo ────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      Object.keys(byTripRef.current).forEach(id => { loadPath(id); });
    }, TRAIL_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadPath]);

  /** Agrega un GPS del conductor al trazo de su viaje (desde SignalR). */
  const appendPoint = useCallback((tripId: string, lat: number, lng: number, at: string) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const cur = byTripRef.current[tripId];
    if (!cur) return; // el viaje aún no está en la lista; la recarga lo traerá
    const last = cur.points[cur.points.length - 1];
    if (last && last[0] === lat && last[1] === lng) return; // mismo punto, nada que dibujar

    const atMs = new Date(at).getTime() || Date.now();
    (tailsRef.current[tripId] ??= []).push({ lat, lng, atMs });

    const points = [...cur.points, [lat, lng] as [number, number]];
    const times = [...cur.times, atMs];
    const distanceKm = last ? cur.distanceKm + haversineKm(last[0], last[1], lat, lng) : 0;
    const iso = new Date(atMs).toISOString();
    const updated: LiveTrail = { ...cur, points, times, distanceKm, lastAt: iso, firstAt: cur.firstAt ?? iso };
    byTripRef.current = { ...byTripRef.current, [tripId]: updated };
    setByTrip(prev => (prev[tripId] ? { ...prev, [tripId]: updated } : prev));
  }, []);

  return { byTrip, appendPoint };
}
