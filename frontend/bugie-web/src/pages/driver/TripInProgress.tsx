import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BugieMap, { LatLng } from '../../components/BugieMap';
import ServiceIcon from '../../components/ServiceIcon';
import { API, apiFetch } from '../../state/api';
import { useTripsHub } from '../../hooks/useTripsHub';
import { EmptyState, InfoList, Notice, Page, PageLoading, SectionCard, StatusBadge } from '../../components/ui';
import { fmtTime, money, payMethod, tripStatus } from '../../components/tripFormat';

/* ──────────────────────────────────────────────────────────────────────────
   Viaje en curso del conductor, SOLO LECTURA. El viaje se opera en la app
   (llegada, inicio, entrega, fin); aquí solo se mira. La posición llega en
   vivo por el hub /hubs/trips (DriverLocation del grupo del viaje) y el
   estado por TripChanged; si el hub cae, se consulta cada 10 s.
   ────────────────────────────────────────────────────────────────────────── */

interface Waypoint { id: string; address: string; lat: number; lng: number; sortOrder: number; }

interface Trip {
  id: string; status: number; serviceType?: number;
  originAddress: string; destAddress: string;
  originLat: number; originLng: number; destLat: number; destLng: number;
  estimatedFare: number; finalFare?: number | null; paymentMethod: string;
  discountAmount?: number | null; fareBeforeDiscount?: number | null;
  startedAt?: string | null; driverArrivedAt?: string | null;
  driverCurrentLat?: number | null; driverCurrentLng?: number | null;
  passengerName?: string | null;
  waypoints?: Waypoint[];
  // Envío
  packageDescription?: string | null; packageWeightKg?: number | null; packageIsFragile?: boolean;
  recipientName?: string | null; recipientPhone?: string | null;
  pickupVerified?: boolean; deliveryReceivedBy?: string | null; deliveryConfirmedAt?: string | null;
  cancelledBy?: string | null; cancelReason?: string | null;
}

interface PathDto { path: { lat: number; lng: number; recordedAt: string }[]; }

const POLL_FAST_MS = 10_000;
const POLL_SLOW_MS = 30_000;
const IN_TRIP = (s: number) => s === 3 || s === 6;

export default function DriverTripInProgress() {
  const [trip,    setTrip]    = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // El viaje que se estaba mirando terminó: cómo terminó.
  const [ended,   setEnded]   = useState<Trip | null>(null);
  // Recorrido desde que inició el viaje (GPS ya guardado + puntos en vivo).
  const [trail,   setTrail]   = useState<LatLng[]>([]);
  const lastTripId = useRef<string | null>(null);
  const loadRef    = useRef<() => void>(() => {});
  const tripRef    = useRef<Trip | null>(null);
  tripRef.current  = trip;

  loadRef.current = async () => {
    try {
      const d = await apiFetch<Trip | null>(`${API.trips}/trips/active`);
      setError(null);
      if (d) {
        lastTripId.current = d.id;
        setEnded(null);
        setTrip(d);
      } else if (lastTripId.current) {
        const gone = lastTripId.current;
        lastTripId.current = null;
        setEnded(await apiFetch<Trip>(`${API.trips}/trips/${gone}`).catch(() => null));
        setTrip(null);
      } else {
        setTrip(null);
      }
    } catch {
      setError('No se pudo cargar el viaje en curso.');
    } finally {
      setLoading(false);
    }
  };

  const hub = useTripsHub({
    onTripChanged: () => loadRef.current(),
    onReconnected: () => loadRef.current(),
    onDriverLocation: e => {
      setTrip(prev => (prev && prev.id === e.tripId
        ? { ...prev, driverCurrentLat: e.lat, driverCurrentLng: e.lng } : prev));
      setTrail(prev => (tripRef.current && tripRef.current.id === e.tripId && IN_TRIP(tripRef.current.status)
        ? [...prev, { lat: e.lat, lng: e.lng }] : prev));
    },
  });
  // Entrar al grupo del viaje para recibir su posición en vivo.
  const tripId = trip?.id ?? null;
  const [joinedTripId, setJoinedTripId] = useState<string | null>(null);
  useEffect(() => {
    if (!hub.connected || !tripId) { setJoinedTripId(null); return; }
    let active = true;
    hub.joinTrip(tripId).then(ok => { if (active) setJoinedTripId(ok ? tripId : null); });
    return () => { active = false; setJoinedTripId(null); hub.leaveTrip(tripId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.connected, tripId]);

  // Sondeo de respaldo: lento si el hub está en vivo, rápido si no.
  const pollMs = hub.connected && (tripId == null || joinedTripId === tripId) ? POLL_SLOW_MS : POLL_FAST_MS;
  useEffect(() => {
    loadRef.current();
    const t = setInterval(() => loadRef.current(), pollMs);
    return () => clearInterval(t);
  }, [pollMs]);

  // Recorrido ya guardado desde el inicio del viaje (al entrar o al iniciar).
  const inTrip    = trip ? IN_TRIP(trip.status) : false;
  const startedAt = trip?.startedAt ?? null;
  useEffect(() => {
    setTrail([]);
    if (!tripId || !inTrip) return;
    let alive = true;
    apiFetch<PathDto>(`${API.drivers}/drivers/me/trips/${tripId}/path`)
      .then(p => {
        if (!alive) return;
        const from = startedAt ? new Date(startedAt).getTime() : 0;
        const saved = p.path
          .filter(x => new Date(x.recordedAt).getTime() >= from)
          .map(x => ({ lat: x.lat, lng: x.lng }));
        // Los puntos en vivo que llegaron mientras se cargaba van al final.
        setTrail(prev => [...saved, ...prev]);
      })
      .catch(() => { /* sin recorrido guardado: solo se ve lo que llegue en vivo */ });
    return () => { alive = false; };
  }, [tripId, inTrip, startedAt]);

  if (loading) return <PageLoading label="Cargando viaje en curso…" />;

  if (!trip) {
    return (
      <Page title="Viaje en curso" subtitle="Tu viaje activo, en vivo." icon="fa-car-side">
        {ended && <EndedNotice trip={ended} />}
        {error && <Notice tone="bad">{error}</Notice>}
        <EmptyState
          icon="fa-car-side"
          title="No tienes un viaje en curso"
          text="Cuando aceptes un viaje en la app Bugie podrás seguirlo aquí."
          action={<Link className="btn btn-bugie-outline rounded-pill" to="/app/conductor/viajes">Ver historial</Link>}
        />
      </Page>
    );
  }

  const isDelivery = trip.serviceType === 1;
  const st   = tripStatus(trip.status);
  const pay  = payMethod(trip.paymentMethod);
  const fare = trip.fareBeforeDiscount ?? trip.finalFare ?? trip.estimatedFare;
  const toCollect = fare - (trip.discountAmount ?? 0);
  const waypoints = [...(trip.waypoints ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const driverPos = trip.driverCurrentLat != null && trip.driverCurrentLng != null
    ? { lat: trip.driverCurrentLat, lng: trip.driverCurrentLng } : null;
  const phase = trip.status === 6 ? 'SOS activo'
    : inTrip ? (isDelivery ? 'Llevando el envío al destino' : 'Llevando al pasajero al destino')
    : trip.driverArrivedAt ? 'En el punto de recojo'
    : 'Yendo al punto de recojo';

  return (
    <Page
      title={isDelivery ? 'Envío en curso' : 'Viaje en curso'}
      subtitle="Solo lectura: el viaje se gestiona desde la app Bugie."
      icon="fa-car-side"
    >
      {error && <Notice tone="bad">{error}</Notice>}
      {trip.status === 6 && (
        <Notice tone="bad" icon="fa-triangle-exclamation" title="SOS activo">
          El equipo de monitoreo de Bugie ya fue alertado.
        </Notice>
      )}

      <div className="bx-track">
        <div className="bx-stack">
          <SectionCard
            title={phase}
            icon={isDelivery ? 'fa-box' : 'fa-car'}
            actions={<><StatusBadge tone={st.tone} icon={st.icon}>{st.label}</StatusBadge><ServiceIcon delivery={isDelivery} /></>}
          >
            <div className="bx-stack">
              <ol className="bx-stops">
                <li><span className="lbl">Recojo</span><span className="addr">{trip.originAddress}</span></li>
                {waypoints.map((w, i) => (
                  <li key={w.id}><span className="lbl">Parada {i + 1}</span><span className="addr">{w.address}</span></li>
                ))}
                <li className="dest"><span className="lbl">Destino</span><span className="addr">{trip.destAddress}</span></li>
              </ol>
              <InfoList items={[
                { label: isDelivery ? 'Cliente' : 'Pasajero', value: trip.passengerName ?? '—', hidden: !trip.passengerName },
                { label: 'Llegaste al recojo', value: trip.driverArrivedAt ? fmtTime(trip.driverArrivedAt) : '', hidden: !trip.driverArrivedAt || inTrip },
                { label: 'Inició', value: trip.startedAt ? fmtTime(trip.startedAt) : '', hidden: !trip.startedAt },
              ]} />
            </div>
          </SectionCard>

          <SectionCard title="Cobro" icon="fa-wallet">
            <div className="bx-kv total m-0 p-0 border-0">
              <span><i className={`fa-solid ${pay.icon} me-1`} aria-hidden="true" />{pay.label}</span>
              <span>{money(toCollect)}</span>
            </div>
            {!!trip.discountAmount && (
              <p className="small bx-muted mt-2 mb-0">
                Tarifa {money(fare)} − cupón del pasajero {money(trip.discountAmount)}.
                El descuento no sale de tu ganancia.
              </p>
            )}
          </SectionCard>

          {isDelivery && (
            <SectionCard title="Paquete y entrega" icon="fa-box">
              <InfoList items={[
                { label: 'Paquete', value: trip.packageDescription ?? '—', wide: true },
                { label: 'Peso', value: trip.packageWeightKg != null ? `${trip.packageWeightKg} kg` : '', hidden: trip.packageWeightKg == null },
                { label: 'Frágil', value: 'Sí', hidden: !trip.packageIsFragile },
                { label: 'Entregar a', value: trip.recipientName ?? '—' },
                { label: 'Teléfono', value: trip.recipientPhone ? <a href={`tel:${trip.recipientPhone}`}>{trip.recipientPhone}</a> : '', hidden: !trip.recipientPhone },
                { label: 'Recojo', value: trip.pickupVerified ? 'Paquete verificado' : 'Falta verificar el paquete' },
                { label: 'Entrega', value: `Entregado a ${trip.deliveryReceivedBy ?? ''}`, hidden: !trip.deliveryConfirmedAt },
              ]} />
            </SectionCard>
          )}
        </div>

        <div className="bx-track-side">
          <SectionCard flush>
            <div className="p-2 bx-map">
              <BugieMap
                height="clamp(260px, 50vh, 520px)"
                showRoute
                origin={{ lat: trip.originLat, lng: trip.originLng }}
                destination={{ lat: trip.destLat, lng: trip.destLng }}
                waypoints={waypoints.map(w => ({ lat: w.lat, lng: w.lng }))}
                driver={driverPos}
                driverLabel="Tú"
                trail={inTrip ? trail : undefined}
                trailLabel="Tu recorrido"
              />
            </div>
            <p className="small bx-muted px-3 pb-2 mb-0">
              {driverPos ? 'Tu posición se actualiza con el GPS de la app.' : 'Aún no llega tu posición desde la app.'}
              {inTrip && ' La línea verde es lo que ya recorriste.'}
            </p>
          </SectionCard>
        </div>
      </div>
    </Page>
  );
}

/** Aviso cuando el viaje que se estaba mirando terminó. */
function EndedNotice({ trip }: { trip: Trip }) {
  if (trip.status === 4) {
    return <Notice tone="ok" icon="fa-flag-checkered" title={trip.serviceType === 1 ? 'Envío completado' : 'Viaje completado'}>
      Puedes verlo en tu historial.
    </Notice>;
  }
  if (trip.status === 5) {
    const who = trip.cancelledBy === 'driver' ? 'Cancelaste el viaje'
      : trip.cancelledBy === 'admin' ? 'Bugie canceló el viaje' : 'El pasajero canceló el viaje';
    return <Notice tone="warn" icon="fa-circle-xmark" title={who}>
      {trip.cancelReason ? `Motivo: ${trip.cancelReason}` : null}
    </Notice>;
  }
  return null;
}
