import { EmptyState, StatusBadge } from '../../../components/ui';
import { fmtHour, LivePassenger, liveTripStatus } from './types';

interface Props {
  passengers: LivePassenger[];
  sosUserIds: Set<string>;
  selectedTripId: string | null;
  /** Ubicar al pasajero en el mapa. */
  onLocate: (p: LivePassenger) => void;
  /** Abrir el detalle del viaje. */
  onOpen: (p: LivePassenger) => void;
}

/** Viajes activos (un pasajero por viaje) del panel de monitoreo. */
export default function TripsList({ passengers, sosUserIds, selectedTripId, onLocate, onOpen }: Props) {
  if (passengers.length === 0) {
    return <EmptyState compact icon="fa-person" title="Sin viajes activos" text="Nadie tiene un viaje en curso ahora." />;
  }

  return (
    <ul className="lm-list">
      {passengers.map(p => {
        const st       = liveTripStatus(p.status);
        const hasPos   = p.lat !== 0 && p.lng !== 0;
        const selected = selectedTripId === p.tripId;
        const inSos    = sosUserIds.has(p.passengerId);
        return (
          <li key={p.tripId} className="d-flex align-items-stretch">
            <button
              type="button"
              className={`lm-item ${selected ? 'is-selected' : ''} ${inSos ? 'lm-flash-bad' : ''}`}
              onClick={() => onOpen(p)}
              title="Ver detalle del viaje"
            >
              <span className={`lm-avatar bx-tone-${inSos ? 'bad' : 'warn'} ${selected ? 'ring' : ''}`} aria-hidden="true">
                <i className="fa-solid fa-person" />
              </span>
              <span className="main">
                <span className="name d-block">{p.passengerName || 'Pasajero'}</span>
                <span className="sub d-block">
                  <i className="fa-solid fa-id-badge me-1" aria-hidden="true" />{p.driverName ?? 'Sin conductor todavía'}
                </span>
                <span className="meta">
                  <StatusBadge tone={st.tone} size="sm">{st.text}</StatusBadge>
                  {p.updatedAt && <span><i className="fa-regular fa-clock me-1" aria-hidden="true" />{fmtHour(p.updatedAt)}</span>}
                </span>
              </span>
              <span className="end" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></span>
            </button>
            <button
              type="button"
              className="lm-item lm-locate"
              onClick={() => onLocate(p)}
              disabled={!hasPos}
              aria-label={hasPos ? `Ubicar a ${p.passengerName || 'pasajero'} en el mapa` : 'Sin ubicación GPS todavía'}
              title={hasPos ? 'Ubicar en el mapa' : 'Sin ubicación GPS todavía'}
            >
              <i className={`fa-solid ${hasPos ? 'fa-crosshairs' : 'fa-location-slash'} bugie-muted`} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
