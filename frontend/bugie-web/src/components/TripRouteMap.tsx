import { useEffect, useState } from 'react';
import BugieMap, { type LatLng, type MapLine, type MapMarker } from './BugieMap';
import { API, apiFetch } from '../state/api';
import { EmptyState, Skeleton } from './ui';

// ─────────────────────────────────────────────────────────────────────
// Mapa del detalle de un viaje pasado con DOS líneas:
//   * Ruta del sistema: la ruta planificada que guardó Trips
//     (GET /trips/{id}/planned-route). Si el viaje no tiene ruta guardada
//     (viajes antiguos), se dibuja la línea recta origen → paradas → destino
//     como "ruta estimada".
//   * Recorrido real: los puntos GPS que mandó la app del conductor.
// ─────────────────────────────────────────────────────────────────────

interface PlannedLeg { source: string; points: number[][]; distanceMeters: number | null; }
interface PlannedRoute {
  pickup: PlannedLeg | null;
  trip:   PlannedLeg | null;
  origin:      LatLng & { address?: string };
  destination: LatLng & { address?: string };
  stops:       Array<LatLng & { address?: string }>;
}
interface RealPath { points: number; distanceKm: number; path: LatLng[]; }

const PLANNED_COLOR = '#f59e0b';
const REAL_COLOR    = '#7C6AF7';

interface Props {
  tripId: string;
  /** Endpoint del recorrido real (cada rol tiene el suyo). */
  realPathUrl: string;
  /** Texto de la leyenda para el recorrido real. */
  realLabel?: string;
}

export default function TripRouteMap({ tripId, realPathUrl, realLabel = 'Tu recorrido' }: Props) {
  const [planned, setPlanned] = useState<PlannedRoute | null>(null);
  const [real,    setReal]    = useState<RealPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setFailed(false); setPlanned(null); setReal(null);
    Promise.allSettled([
      apiFetch<PlannedRoute>(`${API.trips}/trips/${tripId}/planned-route`),
      apiFetch<RealPath>(realPathUrl),
    ]).then(([p, r]) => {
      if (!alive) return;
      if (p.status === 'fulfilled') setPlanned(p.value);
      if (r.status === 'fulfilled') setReal(r.value);
      if (p.status === 'rejected' && r.status === 'rejected') setFailed(true);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripId, realPathUrl]);

  // Ruta del sistema: la guardada o, si no hay, la línea recta.
  const saved = planned?.trip && planned.trip.points.length > 1 ? planned.trip : null;
  const estimated = !saved || saved.source === 'straight';
  const plannedPoints: LatLng[] = saved
    ? saved.points.map(([lat, lng]) => ({ lat, lng }))
    : planned
      ? [planned.origin, ...(planned.stops ?? []), planned.destination].map(p => ({ lat: p.lat, lng: p.lng }))
      : [];
  const plannedLabel = estimated ? 'Ruta estimada' : 'Ruta del sistema';
  const realPoints = real?.path ?? [];

  const lines: MapLine[] = [
    { points: plannedPoints, color: PLANNED_COLOR, dashed: true, label: plannedLabel },
    { points: realPoints,    color: REAL_COLOR,    label: realLabel },
  ];
  const markers: MapMarker[] = planned
    ? [
        { lat: planned.origin.lat, lng: planned.origin.lng, type: 'origin', label: 'Origen' },
        ...(planned.stops ?? []).map((s, i) => ({ lat: s.lat, lng: s.lng, type: 'default' as const, label: `Parada ${i + 1}` })),
        { lat: planned.destination.lat, lng: planned.destination.lng, type: 'destination', label: 'Destino' },
      ]
    : [];

  const hasSomething = plannedPoints.length > 1 || realPoints.length > 1;

  return (
    <div>
      <div className="bx-box-title"><i className="fa-solid fa-route" aria-hidden="true" />Recorrido</div>
      {loading ? (
        <Skeleton height={240} radius={14} />
      ) : failed ? (
        <EmptyState compact variant="error" title="No se pudo cargar el recorrido" />
      ) : !hasSomething ? (
        <EmptyState compact icon="fa-map" title="No hay recorrido registrado para este viaje" />
      ) : (
        <>
          <div className="bx-map"><BugieMap lines={lines} markers={markers} height="clamp(220px, 34vh, 320px)" /></div>
          <div className="d-flex flex-wrap gap-3 small mt-2" aria-label="Leyenda del mapa">
            <LegendItem color={PLANNED_COLOR} dashed text={plannedLabel} />
            <LegendItem color={REAL_COLOR} text={realLabel} />
          </div>
          <p className="small bx-muted mt-1 mb-0">
            {realPoints.length > 1
              ? <>{real!.distanceKm.toFixed(1)} km recorridos · {real!.points} puntos GPS</>
              : 'No hay puntos GPS del recorrido real.'}
            {saved?.distanceMeters != null && !estimated && <> · Ruta del sistema: {(saved.distanceMeters / 1000).toFixed(1)} km</>}
            {estimated && plannedPoints.length > 1 && <> · La ruta estimada es en línea recta.</>}
          </p>
        </>
      )}
    </div>
  );
}

function LegendItem({ color, text, dashed }: { color: string; text: string; dashed?: boolean }) {
  return (
    <span className="d-inline-flex align-items-center gap-2">
      <span aria-hidden="true" style={{
        display: 'inline-block', width: 28, height: 0,
        borderTop: `4px ${dashed ? 'dashed' : 'solid'} ${color}`,
      }} />
      {text}
    </span>
  );
}
