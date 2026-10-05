import { useEffect, useRef, useState } from 'react';
import TripTimeline from '../../components/TripTimeline';
import ApplyCouponModal, { CouponApplied } from './ApplyCouponModal';
import LevelCouponHint from './LevelCouponHint';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BugieMap from '../../components/BugieMap';
import ServiceIcon from '../../components/ServiceIcon';
import FromBadge from '../../components/FromBadge';
import TripPhotos from '../../components/TripPhotos';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  CountUp, EmptyState, FlashOnChange, IconButton, InfoList, Modal, Notice, Page, PageLoading, SectionCard, Skeleton, StatusBadge, Tone,
  useConfirm, useFlip, usePresenceList, useToast,
} from '../../components/ui';
import { money } from '../../components/tripFormat';

interface Waypoint {
  id: string; address: string;
  lat: number; lng: number; sortOrder: number;
}

interface Proposal {
  id: string; tripId: string; driverId: string;
  fare: number; status: string; createdAt: string;
  // Datos enriquecidos del conductor (vía Trips → Auth + Drivers)
  driverName: string;
  vehiclePlate?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  // Tendencia respecto a la propuesta anterior del mismo conductor
  trend: 'up' | 'down' | 'new';
  previousFare?: number | null;
  // Quién hizo esta propuesta: 'driver' (normal) o 'passenger' (contrapropuesta mía)
  proposedByRole?: 'driver' | 'passenger';
  // Quién la rechazó (si Status == 'rejected'): 'driver' = el conductor declinó
  rejectedBy?: 'passenger' | 'driver' | null;
}

interface ProposalHistoryEntry {
  id: string; fare: number;
  status: 'pending' | 'superseded' | 'accepted' | 'rejected';
  createdAt: string;
}

interface Trip {
  id: string;
  driverId: string | null;
  originAddress: string; destAddress: string;
  originLat: number;    originLng: number;
  destLat: number;      destLng: number;
  estimatedFare: number;
  proposedFare: number | null;
  status: number;

  // Cupon aplicado a este viaje.
  couponCode?: string | null;
  discountAmount?: number | null;
  fareBeforeDiscount?: number | null;
  waypoints?: Waypoint[];
  // Cuando el conductor aviso que ya esta en el punto de recojo
  driverArrivedAt?: string | null;
  // Si se cancelo: quien y por que
  cancelledBy?: string | null;
  cancelReason?: string | null;

  // Envio de paquete (serviceType 1). En un viaje normal vienen en null.
  serviceType?: number;
  packageDescription?: string | null;
  packageWeightKg?: number | null;
  packageIsFragile?: boolean | null;
  packageDetails?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  pickupVerified?: boolean | null;
  pickupObservation?: string | null;
  deliveryReceivedBy?: string | null;
  deliveryConfirmedAt?: string | null;

  // Última posición conocida del conductor (la API la manda con el viaje
  // aceptado / en curso / SOS). Se usa para el marcador en vivo del mapa.
  driverCurrentLat?: number | null;
  driverCurrentLng?: number | null;

  // Programado: hora de Perú (sin zona). null = viaje "ahora".
  scheduledAt?: string | null;
  // Ya cuenta como viaje activo (faltan 30 min o menos, o el conductor llegó)
  scheduledActive?: boolean;
  // El conductor no llegó (15 min después de la hora): cancelar o republicar
  driverLate?: boolean;
}

/** "sáb 04 oct, 10:30" de una fecha de la API (hora de Perú sin zona). */
function fmtScheduled(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('es-PE', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_MSG: Record<number, string> = {
  1: 'Buscando conductor…',
  2: 'Conductor en camino',
  3: 'Viaje en curso',
  4: 'Completado',
  5: 'Cancelado',
  6: 'SOS activo',
  7: 'Conductores proponen tarifa',
};

// En un envio algunos estados se nombran distinto
const STATUS_MSG_DELIVERY: Record<number, string> = {
  2: 'Conductor en camino a recoger',
  3: 'Envío en camino',
  4: 'Entregado',
};

function statusMsg(status: number, delivery: boolean): string {
  return (delivery ? STATUS_MSG_DELIVERY[status] : undefined) ?? STATUS_MSG[status] ?? 'Procesando…';
}

function hourOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_TONE: Record<number, Tone> = {
  1: 'warn', 2: 'info', 3: 'ok',
  4: 'ok', 5: 'neutral', 6: 'bad', 7: 'primary',
};

const HISTORY_LABEL: Record<string, { label: string; tone: Tone }> = {
  pending:    { label: 'Actual',     tone: 'primary' },
  superseded: { label: 'Modificada', tone: 'neutral' },
  accepted:   { label: 'Aceptada',   tone: 'ok' },
  rejected:   { label: 'Rechazada',  tone: 'bad' },
};

/** Devuelve un texto relativo amigable: "hace 30s", "hace 2 min", etc. */
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5)   return 'ahora mismo';
  if (seconds < 60)  return `hace ${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60)     return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)    return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export default function PassengerTracking() {
  const navigate   = useNavigate();
  const toast      = useToast();
  const confirm    = useConfirm();
  // ?trip=<id>: seguir un viaje en particular (ej. un programado que todavía
  // no es el viaje activo). Sin parámetro: el viaje activo.
  const [params]   = useSearchParams();
  const tripParam  = params.get('trip');
  const [trip,      setTrip]      = useState<Trip | null>(null);
  // Programados (para la pantalla vacía)
  const [scheduled, setScheduled] = useState<Trip[]>([]);
  const [republishing, setRepublishing] = useState(false);
  // Aviso "tu conductor llego": se muestra una vez por viaje al detectarlo
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const arrivedShownFor = useRef<string | null>(null);
  // El conductor (o Bugie) cancelo el viaje: aviso con el motivo
  const [cancelledInfo, setCancelledInfo] = useState<{ by: string; reason: string | null; delivery: boolean } | null>(null);
  const lastTripId = useRef<string | null>(null);
  const [cuponAbierto, setCuponAbierto] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Estado del modal de histórico
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyDriver,  setHistoryDriver]  = useState<{ id: string; name: string } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ProposalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Tick para refrescar etiquetas timeAgo cada 15s sin recargar propuestas
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 15000);
    return () => clearInterval(t);
  }, []);

  // Estado del input de contrapropuesta por cada propuesta (key = proposalId)
  const [counterFare,    setCounterFare]    = useState<Record<string, string>>({});
  const [counteringId,   setCounteringId]   = useState<string | null>(null);  // proposalId al que le estoy contraproponiendo
  const [counterSending, setCounterSending] = useState(false);

  // IDs de propuestas que el usuario ocultó manualmente (con la X).
  // No se persiste — al recargar la pantalla, vuelven a aparecer si siguen rejected.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Propuestas visibles (sin las ocultadas a mano), con entrada/salida animada.
  const visible     = proposals.filter(p => !hiddenIds.has(p.id));
  const offerEntries = usePresenceList(visible, p => p.id);
  const offersRef   = useRef<HTMLDivElement>(null);
  useFlip(offersRef, offerEntries);

  useEffect(() => {
    const load = () =>
      (tripParam
        ? apiFetch<Trip>(`${API.trips}/trips/${tripParam}/tracking`)
            // Terminado o cancelado: se trata como "sin viaje" (con el aviso si aplica)
            .then(t => (t && (t.status === 4 || t.status === 5) ? null : t))
            .catch(err => { if (err instanceof ApiError && err.status === 404) return null; throw err; })
        : apiFetch<Trip | null>(`${API.trips}/trips/active`))
        .then(async d => {
          // El viaje ya no esta activo: si lo cancelo el conductor, avisar con el motivo.
          if (!d && lastTripId.current) {
            const gone = lastTripId.current;
            lastTripId.current = null;
            const t = await apiFetch<Trip>(`${API.trips}/trips/${gone}`).catch(() => null);
            if (t?.status === 5 && t.cancelledBy && t.cancelledBy !== 'passenger')
              setCancelledInfo({ by: t.cancelledBy, reason: t.cancelReason ?? null, delivery: t.serviceType === 1 });
          }
          if (d) lastTripId.current = d.id;
          setTrip(d);
          setError(null);
          if (d && d.status === 2 && d.driverArrivedAt && arrivedShownFor.current !== d.id) {
            arrivedShownFor.current = d.id;
            setArrivedOpen(true);
          }
          if (d && (d.status === 1 || d.status === 7)) {
            try {
              const props = await apiFetch<Proposal[]>(`${API.trips}/trips/${d.id}/proposals`);
              setProposals(props ?? []);
            } catch (_) { setProposals([]); }
          } else {
            setProposals([]);
          }
          // Sin viaje: mostrar los programados que tenga
          if (!d) {
            const list = await apiFetch<Trip[]>(`${API.trips}/trips/scheduled`).catch(() => []);
            setScheduled(list ?? []);
          }
        })
        .catch(() => setError('No se pudo cargar el seguimiento. Reintentamos cada 3 segundos.'))
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [tripParam]);

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback);
  }

  async function acceptProposal(proposalId: string) {
    if (!trip) return;
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/accept-proposal/${proposalId}`, { method: 'PUT' });
      // FLUJO NUEVO: aceptar una propuesta ya NO asigna conductor automáticamente.
      // Solo marca la propuesta como 'accepted_by_passenger' en BD; el viaje
      // sigue en Pending/Negotiating hasta que el conductor confirme.
      // El próximo poll (3s) traerá el nuevo estado y aparecerá el aviso.
      toast.info('Aceptaste la propuesta. Esperamos la confirmación del conductor.');
    } catch (err) { fail(err, 'Error al aceptar propuesta.'); }
  }

  /**
   * Deshace la aceptación. La propuesta vuelve a 'pending' y se guarda
   * un registro inmutable en BD. El pasajero queda libre para aceptar otra.
   * Pide confirmación antes (es un cambio auditado).
   */
  async function cancelAcceptance(proposalId: string) {
    if (!trip) return;
    const ok = await confirm({
      title: '¿Cambiar de opinión?',
      message: 'La propuesta volverá a estar pendiente y podrás aceptar otra. El conductor todavía podría confirmar si lo hace antes que aceptes a otro.',
      confirmText: 'Sí, cambiar de opinión',
      cancelText: 'Seguir esperando',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/cancel-acceptance/${proposalId}`, { method: 'PUT' });
    } catch (err) { fail(err, 'No se pudo cambiar de opinión.'); }
  }

  /**
   * Rechaza UNA propuesta específica (no todas).
   * La marca como 'rejected' en BD. El conductor ya no la verá activa.
   */
  async function rejectOne(proposalId: string) {
    if (!trip) return;
    try {
      await apiFetch(
        `${API.trips}/trips/${trip.id}/proposals/${proposalId}/reject`,
        { method: 'PUT' });
      setProposals(prev => prev.filter(p => p.id !== proposalId));
    } catch (err) {
      fail(err, 'Error al rechazar.');
    }
  }

  /**
   * Rechaza TODAS las propuestas pending del viaje en una sola llamada.
   * Cada conductor verá "el pasajero rechazó tu propuesta".
   */
  async function rejectAllProposals() {
    if (!trip) return;
    const ok = await confirm({
      title: '¿Rechazar todas las propuestas?',
      message: 'Los conductores recibirán el aviso. Podrás seguir recibiendo propuestas nuevas.',
      confirmText: 'Rechazar todas',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(
        `${API.trips}/trips/${trip.id}/proposals/reject-all`,
        { method: 'PUT' });
      setProposals(prev => prev.map(p =>
        p.status === 'pending'
          ? { ...p, status: 'rejected', rejectedBy: 'passenger' }
          : p));
    } catch (err) {
      fail(err, 'Error al rechazar todas.');
    }
  }

  /**
   * Envía una contrapropuesta al conductor con un monto distinto.
   * El conductor la verá en su pantalla y podrá aceptar/rechazar/contraproponer.
   */
  async function counterPropose(driverId: string, fare: number) {
    if (!trip) return;
    if (fare <= 0) {
      toast.warning('El monto debe ser mayor a 0.');
      return;
    }
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/counter`, {
        method: 'POST',
        body: JSON.stringify({ driverId, fare }),
      });
      // La nueva propuesta llegará en el próximo poll (intervalo 3s)
      toast.success('Contrapropuesta enviada.');
    } catch (err) {
      fail(err, 'Error al enviar contrapropuesta.');
    }
  }

  async function cancel() {
    if (!trip) return;
    const delivery = trip.serviceType === 1;
    const ok = await confirm({
      title: delivery ? '¿Cancelar el envío?' : '¿Cancelar el viaje?',
      message: trip.driverLate
        ? 'Tu conductor no llegó a la hora programada: puedes cancelar sin penalidad.'
        : trip.driverId
          ? 'Avisaremos a tu conductor que cancelaste.'
          : 'Dejarás de recibir propuestas de conductores.',
      confirmText: delivery ? 'Cancelar envío' : 'Cancelar viaje',
      cancelText: 'No, seguir',
      tone: 'danger',
    });
    if (!ok) return;
    setCancelling(true);
    try {
      lastTripId.current = null; // lo cancela el propio pasajero: sin aviso
      await apiFetch(`${API.trips}/trips/${trip.id}/cancel`, { method: 'PUT' });
      navigate('/app/pasajero/inicio');
    } catch (err) { fail(err, 'Error al cancelar.'); }
    finally { setCancelling(false); }
  }

  /**
   * Programado cuyo conductor no llegó: vuelve a pendiente para otros
   * conductores (se quita al conductor y se le avisa).
   */
  async function republish() {
    if (!trip) return;
    const delivery = trip.serviceType === 1;
    const ok = await confirm({
      title: delivery ? '¿Republicar el envío?' : '¿Republicar el viaje?',
      message: 'Quitaremos a tu conductor y otros conductores podrán enviarte propuestas de nuevo.',
      confirmText: 'Sí, republicar',
      cancelText: 'No, esperar',
      tone: 'warning',
    });
    if (!ok) return;
    setRepublishing(true);
    try {
      const t = await apiFetch<Trip>(`${API.trips}/trips/${trip.id}/republish`, { method: 'PUT' });
      setTrip(t);
      toast.success(delivery ? 'Republicamos tu envío.' : 'Republicamos tu viaje.');
    } catch (err) { fail(err, 'No se pudo republicar.'); }
    finally { setRepublishing(false); }
  }

  async function openHistory(driverId: string, driverName: string) {
    if (!trip) return;
    setHistoryDriver({ id: driverId, name: driverName });
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const list = await apiFetch<ProposalHistoryEntry[]>(
        `${API.trips}/trips/${trip.id}/proposals/history?driverId=${driverId}`);
      setHistoryEntries(list ?? []);
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryOpen(false);
    setHistoryDriver(null);
    setHistoryEntries([]);
  }

  if (loading) return <PageLoading />;

  if (!trip) return (
    <Page title="Seguimiento" subtitle="Estado de tu viaje o envío en curso." icon="fa-location-dot">
      {error && <Notice tone="bad">{error}</Notice>}
      <SectionCard>
        <EmptyState
          icon="fa-car-side"
          title="No tienes viajes ni envíos activos"
          text="Cuando pidas un viaje o un envío podrás seguirlo aquí en tiempo real."
          action={
            <button type="button" className="btn btn-bugie" onClick={() => navigate('/app/pasajero/solicitar')}>
              <i className="fa-solid fa-map-pin" aria-hidden="true" />Pedir viaje o envío
            </button>
          }
        />
      </SectionCard>

      {/* Programados que todavía no empiezan */}
      {scheduled.length > 0 && (
        <SectionCard title="Tus programados" icon="fa-calendar-days"
          description="Puedes negociar, ver o cancelar cada uno antes de su hora.">
          <div className="bx-list">
            {scheduled.map(s => (
              <Link key={s.id} to={`/app/pasajero/seguimiento?trip=${s.id}`} className="bx-list-item">
                <span className={`bx-list-icon bx-tone-${s.driverId ? 'ok' : 'warn'}`} aria-hidden="true">
                  <i className={`fa-solid ${s.serviceType === 1 ? 'fa-box' : 'fa-car'}`} />
                </span>
                <span className="bx-list-text">
                  <span className="bx-list-title">{s.scheduledAt ? fmtScheduled(s.scheduledAt) : ''}</span>
                  <span className="bx-list-sub d-block text-truncate">{s.originAddress} → {s.destAddress}</span>
                  <span className={`bx-list-sub d-block ${s.driverId ? 'bx-text-ok' : 'bx-text-warn'}`}>
                    {s.driverId ? 'Conductor asignado' : s.status === 7 ? 'Recibiendo propuestas' : 'Buscando conductor'}
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {/* El conductor o Bugie cancelaron */}
      <Modal
        open={!!cancelledInfo}
        onClose={() => setCancelledInfo(null)}
        size="sm"
        footer={cancelledInfo && (
          <>
            <button type="button" className="btn btn-bugie-outline" onClick={() => setCancelledInfo(null)}>Cerrar</button>
            <button type="button" className="btn btn-bugie" data-autofocus
                    onClick={() => { setCancelledInfo(null); navigate('/app/pasajero/solicitar'); }}>
              {cancelledInfo.delivery ? 'Pedir otro envío' : 'Pedir otro viaje'}
            </button>
          </>
        )}
      >
        {cancelledInfo && (
          <div className="bx-hero-state bx-tone-bad" role="alertdialog" aria-labelledby="cancel-title">
            <span className="ico" aria-hidden="true"><i className="fa-solid fa-circle-xmark" /></span>
            <div className="d-flex justify-content-center gap-2 flex-wrap">
              <FromBadge by={cancelledInfo.by} />
              <ServiceIcon delivery={cancelledInfo.delivery} />
            </div>
            <h2 id="cancel-title">
              {cancelledInfo.by === 'driver'
                ? `Tu conductor canceló ${cancelledInfo.delivery ? 'el envío' : 'el viaje'}`
                : `Bugie canceló ${cancelledInfo.delivery ? 'tu envío' : 'tu viaje'}`}
            </h2>
            {cancelledInfo.reason && <p>Motivo: {cancelledInfo.reason}</p>}
            <p>Puedes pedir {cancelledInfo.delivery ? 'otro envío' : 'otro viaje'} cuando quieras.</p>
          </div>
        )}
      </Modal>
    </Page>
  );

  const delivery   = trip.serviceType === 1;
  // Programado aceptado que aun no llega su hora: no esta "en camino"
  const msg        = trip.scheduledAt && !trip.scheduledActive && trip.status === 2
    ? 'Programado · conductor asignado'
    : trip.driverLate ? 'El conductor no llegó' : statusMsg(trip.status, delivery);
  const tone       = STATUS_TONE[trip.status] ?? 'info';
  const hasCoords  = trip.originLat && trip.originLng && trip.destLat && trip.destLng;
  const sortedWp   = [...(trip.waypoints ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const wpCoords   = sortedWp.map(w => ({ lat: w.lat, lng: w.lng }));
  // Programado que todavía no llega su hora (no es el viaje activo)
  const isScheduled   = !!trip.scheduledAt;
  const futureSched   = isScheduled && !trip.scheduledActive;
  // Un programado aceptado se puede cancelar antes de que el conductor llegue
  const canCancel  = trip.status === 1 || trip.status === 7
    || (isScheduled && trip.status === 2 && !trip.driverArrivedAt);
  const canSos     = [1, 2, 3].includes(trip.status) && !futureSched;
  const toPay      = trip.discountAmount
    ? (trip.fareBeforeDiscount ?? trip.estimatedFare) - trip.discountAmount
    : trip.estimatedFare;

  // ¿Ya aceptó una? Entonces se bloquean las demás y se muestra el aviso.
  const waiting    = visible.find(p => p.status === 'accepted_by_passenger');
  const hasWaiting = !!waiting;
  const pendingFromDrivers = visible.filter(p => p.status === 'pending' && p.proposedByRole !== 'passenger').length;

  return (
    <Page
      title={delivery ? 'Seguimiento del envío' : 'Seguimiento del viaje'}
      subtitle={<span className="d-inline-flex align-items-center gap-2 flex-wrap"><StatusBadge tone={tone} dot>{msg}</StatusBadge><ServiceIcon delivery={delivery} /></span>}
      icon={delivery ? 'fa-box' : 'fa-car'}
      actions={[{
        label: 'SOS', icon: 'fa-triangle-exclamation', variant: 'danger',
        to: '/app/pasajero/sos', hidden: !canSos,
        title: 'Solo en caso de emergencia real',
      }]}
    >
      {error && <Notice tone="bad">{error}</Notice>}

      {isScheduled && !trip.driverLate && (
        <Notice tone={futureSched ? 'info' : 'ok'} icon="fa-calendar-check"
                title={`Programado para el ${fmtScheduled(trip.scheduledAt!)}`}>
          {trip.status === 2
            ? (futureSched
                ? 'Tu conductor ya está asignado. Te recordaremos 30 y 10 minutos antes.'
                : 'Ya casi es la hora: tu conductor se prepara para ir al punto de recojo.')
            : 'Los conductores pueden enviarte propuestas desde ahora.'}
        </Notice>
      )}

      {trip.driverLate && (
        <Notice
          tone="bad"
          icon="fa-clock"
          title="Tu conductor no llegó a la hora programada"
          action={
            <div className="d-flex gap-2 flex-wrap">
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={cancel} disabled={cancelling || republishing}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />Cancelar sin penalidad
              </button>
              <button type="button" className="btn btn-sm btn-bugie" onClick={republish} disabled={cancelling || republishing}>
                {republishing
                  ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                  : <i className="fa-solid fa-rotate" aria-hidden="true" />}
                Republicar
              </button>
            </div>
          }
        >
          Era para el {fmtScheduled(trip.scheduledAt!)}. Puedes cancelar sin penalidad o republicarlo para que lo tome otro conductor.
        </Notice>
      )}

      {trip.status === 2 && trip.driverArrivedAt && (
        <Notice tone="ok" icon="fa-location-dot" title="Tu conductor ya está en el punto de recojo">
          Avisó a las {hourOf(trip.driverArrivedAt)}.
        </Notice>
      )}

      {hasWaiting && (
        <Notice
          tone="warn"
          icon="fa-hourglass-half"
          title="Esperando confirmación del conductor"
          action={
            <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => cancelAcceptance(waiting!.id)}>
              <i className="fa-solid fa-rotate-left" aria-hidden="true" />Cambiar de opinión
            </button>
          }
        >
          Aceptaste a <strong>{waiting!.driverName}</strong>. En cuanto confirme, empieza el viaje.
          Si tarda demasiado, puedes cambiar de opinión.
        </Notice>
      )}

      <div className="bx-track">
        <div className="bx-stack">
          {/* Estado y recorrido */}
          <SectionCard
            title="Tu recorrido"
            icon="fa-route"
            footer={canCancel && (
              <div className="bx-actions end">
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={cancel} disabled={cancelling}>
                  {cancelling
                    ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                    : <i className="fa-solid fa-xmark" aria-hidden="true" />}
                  {delivery ? 'Cancelar envío' : 'Cancelar viaje'}
                </button>
              </div>
            )}
          >
            <div className="bx-stack">
              <TripTimeline
                status={trip.status}
                delivery={delivery}
                arrived={!!trip.driverArrivedAt}
                pickedUp={!!trip.pickupVerified}
                delivered={!!trip.deliveryConfirmedAt}
                scheduledWaiting={futureSched && trip.status === 2}
              />

              <ol className="bx-stops">
                <li><span className="lbl">Origen</span><span className="addr">{trip.originAddress}</span></li>
                {sortedWp.map((wp, i) => (
                  <li key={wp.id} className="stop"><span className="lbl">Parada {i + 1}</span><span className="addr">{wp.address}</span></li>
                ))}
                <li className="dest"><span className="lbl">Destino</span><span className="addr">{trip.destAddress}</span></li>
              </ol>

              <div className="bx-mini-stats">
                <div className="bx-box">
                  <div className="l">{trip.discountAmount ? 'Pagas' : 'Tarifa'}</div>
                  <div className="v"><CountUp value={toPay} format={money} decimals={2} duration={700} /></div>
                  {trip.discountAmount ? (
                    <div className="small bx-muted text-decoration-line-through">
                      S/ {(trip.fareBeforeDiscount ?? trip.estimatedFare).toFixed(2)}
                    </div>
                  ) : null}
                </div>
                <div className="bx-box">
                  <div className="l">Conductor</div>
                  <div className="v">
                    {trip.driverId
                      ? <span className="bx-text-ok"><i className="fa-solid fa-check me-1" aria-hidden="true" />Asignado</span>
                      : <span className="bx-muted">Buscando…</span>}
                  </div>
                </div>
                {sortedWp.length > 0 && (
                  <div className="bx-box">
                    <div className="l">Paradas</div>
                    <div className="v">{sortedWp.length}</div>
                  </div>
                )}
              </div>

              {/* Cupon: solo con el viaje aceptado o en curso. Antes no hay
                  precio que descontar; despues ya se cobro. */}
              {(trip.status === 2 || trip.status === 3) && (
                trip.discountAmount ? (
                  <Notice tone="ok" icon="fa-tag">
                    Cupón <strong>{trip.couponCode}</strong> aplicado · −S/ {trip.discountAmount.toFixed(2)}
                  </Notice>
                ) : (
                  <>
                    <LevelCouponHint tripId={trip.id} onApply={() => setCuponAbierto(true)} />
                    <div>
                      <button type="button" className="btn btn-sm btn-bugie-outline" onClick={() => setCuponAbierto(true)}>
                        <i className="fa-solid fa-tag" aria-hidden="true" />Usar un cupón
                      </button>
                    </div>
                  </>
                )
              )}
            </div>
          </SectionCard>

          {/* Propuestas de conductores */}
          {offerEntries.length > 0 && (
            <SectionCard
              title={`${Math.max(visible.length, 1)} conductor${visible.length > 1 ? 'es proponen' : ' propone'} una tarifa`}
              icon="fa-tag"
              description="Acepta, contrapropón o rechaza. Se actualiza solo."
              footer={pendingFromDrivers > 1 && (
                <div className="text-center">
                  <button type="button" className="btn btn-sm btn-link text-danger" onClick={rejectAllProposals}>
                    <i className="fa-solid fa-xmark" aria-hidden="true" />Rechazar todas las propuestas
                  </button>
                </div>
              )}
            >
              <div className="bx-stack-sm" ref={offersRef}>
                {offerEntries.map(({ item: p, state: anim }) => {
                  const isMine     = p.proposedByRole === 'passenger';
                  const isOpen     = counteringId === p.id;
                  // Declinada por el conductor
                  const isDeclined = p.status === 'rejected' && p.rejectedBy === 'driver';
                  // La propuesta que el pasajero ya aceptó (esperando confirmación): sin botones.
                  const isAcceptedByMe = p.status === 'accepted_by_passenger';
                  const cls = isAcceptedByMe ? 'is-chosen' : isDeclined ? 'is-declined' : isMine ? 'is-mine' : '';
                  // Animación: nueva entra con slide + resaltado; la que se va sale colapsando.
                  const animCls = anim === 'enter' ? 'is-entering' : anim === 'exit' ? 'is-leaving' : '';
                  return (
                    <article key={p.id} data-flip-key={p.id} className={`bx-offer ${cls} ${animCls}`}
                             aria-hidden={anim === 'exit' || undefined}>
                      {isAcceptedByMe && (
                        <StatusBadge tone="warn" icon="fa-hourglass-half">Esperando confirmación del conductor</StatusBadge>
                      )}

                      <div className="bx-offer-head">
                        <span className={`bx-list-icon bx-tone-${isDeclined ? 'bad' : isMine ? 'warn' : 'primary'}`} aria-hidden="true">
                          <i className="fa-solid fa-car-side" />
                        </span>
                        <div className="bx-offer-who">
                          <div className="n">
                            {p.driverName}
                            {p.vehiclePlate && <span className="bx-muted small fw-normal"> · {p.vehiclePlate}</span>}
                          </div>
                          {(p.vehicleBrand || p.vehicleModel || p.vehicleColor) && (
                            <div className="s">{[p.vehicleBrand, p.vehicleModel, p.vehicleColor].filter(Boolean).join(' · ')}</div>
                          )}
                          <div className="s">
                            {timeAgo(p.createdAt)}
                            {isMine && !isDeclined && <span className="bx-text-warn"> · Tu contrapropuesta, esperando respuesta</span>}
                            {isDeclined && (
                              <span className="bx-text-bad fw-semibold"> · <i className="fa-solid fa-ban" aria-hidden="true" /> El conductor declinó</span>
                            )}
                          </div>
                        </div>
                        <div className="bx-offer-price">
                          {/* Destello al cambiar el monto: verde si baja (bueno para el pasajero), ámbar si sube */}
                          <FlashOnChange value={p.fare} good={(a, b) => b < a}>
                            <div className="v">S/ {p.fare.toFixed(2)}</div>
                          </FlashOnChange>
                          {p.trend !== 'new' && !isDeclined && (
                            <div className={`t ${p.trend}`}>
                              <i className={`fa-solid ${p.trend === 'down' ? 'fa-arrow-down' : 'fa-arrow-up'} me-1`} aria-hidden="true" />
                              {p.trend === 'down' ? 'Bajó' : 'Subió'}
                              {p.previousFare != null && <span className="bx-muted fw-normal"> (antes S/ {p.previousFare.toFixed(2)})</span>}
                            </div>
                          )}
                        </div>
                        {isDeclined && (
                          <IconButton icon="fa-xmark" label="Ocultar esta propuesta" size="sm" variant="ghost"
                                      onClick={() => setHiddenIds(prev => new Set(prev).add(p.id))} />
                        )}
                      </div>

                      {/* Acciones: no si está declinada, si es mi contrapropuesta, si está
                          abierto el campo o si es la que YA acepté. */}
                      {!isMine && !isOpen && !isDeclined && !isAcceptedByMe && (
                        <div className="bx-offer-actions">
                          <button type="button" className="btn btn-sm btn-bugie-outline bx-icon-only"
                                  title="Ver propuestas anteriores" aria-label={`Ver propuestas anteriores de ${p.driverName}`}
                                  onClick={() => openHistory(p.driverId, p.driverName)}>
                            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger"
                                  disabled={hasWaiting} onClick={() => rejectOne(p.id)}>
                            <i className="fa-solid fa-xmark" aria-hidden="true" />Rechazar
                          </button>
                          <button type="button" className="btn btn-sm btn-bugie-outline"
                                  disabled={hasWaiting}
                                  onClick={() => {
                                    setCounteringId(p.id);
                                    setCounterFare(prev => ({ ...prev, [p.id]: p.fare.toFixed(2) }));
                                  }}>
                            <i className="fa-solid fa-arrow-right-arrow-left" aria-hidden="true" />Contraproponer
                          </button>
                          <button type="button" className="btn btn-sm btn-success"
                                  disabled={hasWaiting}
                                  title={hasWaiting ? 'Ya aceptaste otra propuesta. Espera la confirmación del conductor.' : undefined}
                                  onClick={() => acceptProposal(p.id)}>
                            <i className="fa-solid fa-check" aria-hidden="true" />
                            {hasWaiting ? 'Esperando otro conductor' : `Aceptar S/ ${p.fare.toFixed(2)}`}
                          </button>
                        </div>
                      )}

                      {/* Contrapropuesta */}
                      {isOpen && (
                        <form
                          className="bx-box"
                          onSubmit={async e => {
                            e.preventDefault();
                            const fare = parseFloat(counterFare[p.id] ?? '0');
                            if (isNaN(fare) || fare <= 0) {
                              toast.warning('Ingresa un monto válido.');
                              return;
                            }
                            setCounterSending(true);
                            await counterPropose(p.driverId, fare);
                            setCounterSending(false);
                            setCounteringId(null);
                          }}
                        >
                          <label className="bx-field-label mb-1" htmlFor={`counter-${p.id}`}>Tu monto propuesto</label>
                          <div className="input-group">
                            <span className="input-group-text">S/</span>
                            <input
                              id={`counter-${p.id}`}
                              type="number" min={1} step={0.5} inputMode="decimal"
                              className="form-control"
                              value={counterFare[p.id] ?? ''}
                              onChange={e => setCounterFare(prev => ({ ...prev, [p.id]: e.target.value }))}
                              disabled={counterSending}
                              autoFocus
                            />
                          </div>
                          <div className="bx-actions end mt-2">
                            <button type="button" className="btn btn-sm btn-bugie-outline" disabled={counterSending}
                                    onClick={() => setCounteringId(null)}>
                              Cancelar
                            </button>
                            <button type="submit" className="btn btn-sm btn-bugie" disabled={counterSending}>
                              {counterSending
                                ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                : <i className="fa-solid fa-paper-plane" aria-hidden="true" />}
                              Enviar
                            </button>
                          </div>
                        </form>
                      )}
                    </article>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Datos del envío: paquete, destinatario, estado y fotos */}
          {delivery && (
            <SectionCard
              title="Tu envío"
              icon="fa-box"
              actions={trip.deliveryConfirmedAt
                ? <StatusBadge tone="ok">Entregado</StatusBadge>
                : trip.pickupVerified
                  ? <StatusBadge tone="info">Paquete recogido</StatusBadge>
                  : <StatusBadge tone="warn">Esperando recojo</StatusBadge>}
            >
              <div className="bx-stack">
                <InfoList items={[
                  { label: 'Paquete', value: trip.packageDescription || '—', wide: true },
                  { label: 'Peso', value: `${trip.packageWeightKg} kg`, hidden: trip.packageWeightKg == null },
                  { label: 'Frágil', value: trip.packageIsFragile
                      ? <span className="bx-text-bad"><i className="fa-solid fa-triangle-exclamation me-1" aria-hidden="true" />Sí</span>
                      : 'No' },
                  { label: 'Detalles', value: trip.packageDetails, wide: true, hidden: !trip.packageDetails },
                  { label: 'Recibe', value: trip.recipientName || '—' },
                  { label: 'Teléfono', value: trip.recipientPhone
                      ? <a href={`tel:${trip.recipientPhone}`}>{trip.recipientPhone}</a> : '—' },
                ]} />

                <div className="bx-box small">
                  {trip.deliveryConfirmedAt ? (
                    <><i className="fa-solid fa-circle-check bx-text-ok me-2" aria-hidden="true" />
                      Entregado a <strong>{trip.deliveryReceivedBy || 'destinatario'}</strong>, a las {hourOf(trip.deliveryConfirmedAt)}</>
                  ) : trip.pickupVerified ? (
                    <><i className="fa-solid fa-box-open me-2" aria-hidden="true" />Paquete recogido y verificado</>
                  ) : (
                    <><i className="fa-solid fa-hourglass-half bx-text-warn me-2" aria-hidden="true" />Esperando recojo</>
                  )}
                  {trip.pickupObservation && (
                    <div className="bx-muted mt-1">Observación del conductor: {trip.pickupObservation}</div>
                  )}
                </div>

                <div>
                  <div className="bx-box-title"><i className="fa-solid fa-images" aria-hidden="true" />Fotos</div>
                  <TripPhotos tripId={trip.id}
                    refreshKey={`${trip.pickupVerified ? 1 : 0}-${trip.deliveryConfirmedAt ?? ''}`} />
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* Mapa */}
        <div className="bx-track-side">
          <SectionCard flush>
            {hasCoords ? (
              <div className="p-2 bx-map">
                <BugieMap
                  height="clamp(260px, 45vh, 460px)"
                  showRoute
                  origin={{ lat: trip.originLat, lng: trip.originLng }}
                  destination={{ lat: trip.destLat, lng: trip.destLng }}
                  waypoints={wpCoords}
                  driver={trip.driverCurrentLat != null && trip.driverCurrentLng != null
                    ? { lat: trip.driverCurrentLat, lng: trip.driverCurrentLng } : null}
                />
              </div>
            ) : (
              <EmptyState compact icon="fa-map" title="Mapa no disponible" />
            )}
          </SectionCard>
        </div>
      </div>

      {/* Aviso: el conductor llegó al punto de recojo */}
      <Modal
        open={arrivedOpen}
        onClose={() => setArrivedOpen(false)}
        size="sm"

        footer={
          <button type="button" className="btn btn-bugie w-100" data-autofocus onClick={() => setArrivedOpen(false)}>
            Entendido
          </button>
        }
      >
        <div className="bx-hero-state bx-tone-ok" role="alertdialog" aria-labelledby="arrived-title">
          <span className="ico" aria-hidden="true"><i className="fa-solid fa-location-dot" /></span>
          <div className="d-flex justify-content-center gap-2 flex-wrap">
            <FromBadge by="driver" />
            <ServiceIcon delivery={delivery} />
          </div>
          <h2 id="arrived-title">Tu conductor llegó</h2>
          <p>
            {delivery
              ? 'Tu conductor ya está en el punto de recojo. Entrégale el paquete.'
              : 'Tu conductor ya está en el punto de recojo. Sal a su encuentro.'}
          </p>
        </div>
      </Modal>

      {/* Histórico de propuestas de un conductor (solo visual) */}
      <Modal
        open={historyOpen && !!historyDriver}
        onClose={closeHistory}
        size="sm"
        title={historyDriver ? `Propuestas de ${historyDriver.name}` : 'Propuestas'}
        description={`Lo que te propuso para tu ${delivery ? 'envío' : 'viaje'}. Solo visual.`}
        footer={<button type="button" className="btn btn-bugie-outline" onClick={closeHistory}>Cerrar</button>}
      >
        {historyLoading ? (
          <Skeleton height={48} count={3} />
        ) : historyEntries.length === 0 ? (
          <EmptyState compact title="No hay registros" />
        ) : (
          <div className="bx-stack-sm">
            {historyEntries.map(h => {
              const cfg = HISTORY_LABEL[h.status] ?? { label: h.status, tone: 'neutral' as Tone };
              return (
                <div key={h.id} className="bx-box d-flex justify-content-between align-items-center gap-2 m-0"
                     style={{ opacity: h.status === 'pending' ? 1 : 0.8 }}>
                  <div>
                    <div className="fw-bold">S/ {h.fare.toFixed(2)}</div>
                    <div className="small bx-muted">{timeAgo(h.createdAt)}</div>
                  </div>
                  <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
                </div>
              );
            })}
          </div>
        )}
        <p className="small bx-muted mt-3 mb-0">
          <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
          Solo puedes aceptar la propuesta vigente. Para volver a un precio anterior, pide al conductor que la envíe de nuevo.
        </p>
      </Modal>

      {cuponAbierto && trip ? (
        <ApplyCouponModal
          tripId={trip.id}
          fare={trip.fareBeforeDiscount ?? trip.proposedFare ?? trip.estimatedFare}
          onClose={() => setCuponAbierto(false)}
          onApplied={(r: CouponApplied) => {
            setCuponAbierto(false);
            toast.success(`Cupón ${r.code} aplicado.`);
            // Se refleja de inmediato sin esperar al siguiente sondeo.
            setTrip(t => t ? {
              ...t,
              couponCode: r.code,
              discountAmount: r.discountAmount,
              fareBeforeDiscount: r.fareBeforeDiscount,
            } : t);
          }}
        />
      ) : null}
    </Page>
  );
}
