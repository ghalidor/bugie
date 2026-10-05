import { EmptyState, StatusBadge } from '../../../components/ui';
import { fmtDateTime, fmtWhen, LivePassenger, minutesAgo, roleLabel, RouteDeviation, SosAlert } from './types';

interface Props {
  alerts: SosAlert[];
  deviations: RouteDeviation[];
  passengers: LivePassenger[];
  driverName: (dv: RouteDeviation) => string;
  onOpenSos: (a: SosAlert) => void;
  onResolveSos: (a: SosAlert) => void;
  onOpenDeviation: (dv: RouteDeviation) => void;
  onReviewDeviation: (dv: RouteDeviation) => void;
}

/** Pestaña "Alertas": SOS activos primero y luego los desvíos de ruta por revisar. */
export default function AlertsList({ alerts, deviations, passengers, driverName, onOpenSos, onResolveSos, onOpenDeviation, onReviewDeviation }: Props) {
  if (alerts.length === 0 && deviations.length === 0) {
    return <EmptyState compact variant="done" title="Todo tranquilo" text="No hay emergencias ni desvíos de ruta por revisar." />;
  }

  return (
    <>
      {/* ── SOS ── */}
      <h3 className="lm-section-title">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />Alertas SOS
        <StatusBadge tone={alerts.length ? 'bad' : 'ok'} size="sm">{alerts.length}</StatusBadge>
      </h3>
      {alerts.length === 0 ? (
        <p className="px-3 pb-2 small bugie-muted mb-0">No hay emergencias activas.</p>
      ) : (
        <ul className="lm-list">
          {alerts.map(a => (
            <li key={a.id} className="lm-alert lm-flash-bad">
              <div className="head">
                <StatusBadge tone="bad" icon="fa-bell">SOS</StatusBadge>
                <span className="who">{roleLabel(a.userRole)} en emergencia</span>
              </div>
              <div className="when"><i className="fa-regular fa-clock me-1" aria-hidden="true" />{fmtDateTime(a.createdAt)} ({minutesAgo(a.createdAt)})</div>
              <div className="acts">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onOpenSos(a)}>
                  <i className="fa-solid fa-eye me-1" aria-hidden="true" />Ver viaje
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onResolveSos(a)}>
                  <i className="fa-solid fa-circle-check me-1" aria-hidden="true" />Desactivar alerta
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Desvíos ── */}
      <h3 className="lm-section-title mt-2">
        <i className="fa-solid fa-route" aria-hidden="true" />Desvíos de ruta por revisar
        <StatusBadge tone={deviations.length ? 'bad' : 'ok'} size="sm">{deviations.length}</StatusBadge>
      </h3>
      {deviations.length === 0 ? (
        <p className="px-3 pb-2 small bugie-muted mb-0">No hay desvíos pendientes de revisión.</p>
      ) : (
        <ul className="lm-list">
          {deviations.map(dv => {
            const live = passengers.find(p => p.tripId === dv.tripId);
            // "Desviado ahora" solo si el viaje sigue en curso; si ya terminó, solo falta revisarlo.
            const open = dv.status === 'open' && !!live;
            const paxName = live?.passengerName;
            return (
              <li key={dv.id} className={`lm-alert ${open ? 'lm-flash-bad' : ''}`}>
                <div className="head">
                  {!live
                    ? <StatusBadge tone="neutral" icon="fa-flag-checkered">Viaje terminado</StatusBadge>
                    : open
                      ? <StatusBadge tone="bad" icon="fa-route">Desviado ahora</StatusBadge>
                      : <StatusBadge tone="warn" icon="fa-rotate-left">Volvió a la ruta</StatusBadge>}
                  <span className="who text-truncate">{driverName(dv)}</span>
                </div>
                <div className="when">
                  {paxName && <div>Pasajero: {paxName}</div>}
                  <i className="fa-regular fa-clock me-1" aria-hidden="true" />
                  {fmtWhen(dv.startedAt)} ({minutesAgo(dv.startedAt)}) · a {Math.round(dv.distanceM)} m de la ruta
                  {dv.maxDistanceM > dv.distanceM && <> (máx. {Math.round(dv.maxDistanceM)} m)</>}
                </div>
                <div className="acts">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onOpenDeviation(dv)}>
                    <i className="fa-solid fa-eye me-1" aria-hidden="true" />Ver viaje
                  </button>
                  <button type="button" className="btn btn-sm btn-bugie" onClick={() => onReviewDeviation(dv)}>
                    <i className="fa-solid fa-circle-check me-1" aria-hidden="true" />Marcar revisada
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
