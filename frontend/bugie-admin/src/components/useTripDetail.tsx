import { ReactNode, useState } from 'react';
import { API, ApiError, apiFetch } from '../state/api';
import { PERMS, usePermissions } from '../state/permissions';
import TripDetailModal, { TripDetail } from './TripDetailModal';
import { useToast } from './ui';

/// Abre el detalle de un viaje a partir de su Id (pagos, comisiones, SOS,
/// reclamaciones...). Uso:
///   const trip = useTripDetail();
///   <button onClick={() => trip.open(id)}>Ver viaje</button>
///   {trip.modal}
export function useTripDetail() {
  const toast = useToast();
  const { has } = usePermissions();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Mismos permisos que GET /api/trips/{id} en el backend.
  const canOpen = [PERMS.ViewTrips, PERMS.ViewLiveMap, PERMS.ViewComplaints, PERMS.ViewSosCenter,
    PERMS.ViewPassengers, PERMS.ViewDrivers, PERMS.ViewPayments, PERMS.ViewCommissions].some(has);

  async function open(tripId: string) {
    setLoadingId(tripId);
    try {
      setTrip(await apiFetch<TripDetail>(`${API.trips}/trips/${tripId}`));
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 404
        ? 'Ese viaje ya no existe.'
        : err instanceof ApiError ? err.message : 'No se pudo abrir el viaje.');
    } finally { setLoadingId(null); }
  }

  const modal: ReactNode = trip ? <TripDetailModal trip={trip} onClose={() => setTrip(null)} /> : null;
  return { open, modal, loadingId, canOpen };
}

/// Botón-enlace "Ver viaje" (abre el detalle). Sin permiso, no se muestra nada.
export function TripLinkButton({ tripId, opener, children, className }: {
  tripId?: string | null;
  opener: ReturnType<typeof useTripDetail>;
  children?: ReactNode;
  className?: string;
}) {
  if (!tripId || !opener.canOpen) return null;
  const busy = opener.loadingId === tripId;
  return (
    <button type="button" className={`bx-entity-link ${className ?? ''}`} disabled={busy}
            onClick={e => { e.stopPropagation(); opener.open(tripId); }}
            title="Ver el detalle del viaje">
      {busy
        ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
        : <i className="fa-solid fa-route me-1" aria-hidden="true" />}
      {children ?? `Viaje ${tripId.slice(0, 8)}`}
    </button>
  );
}
