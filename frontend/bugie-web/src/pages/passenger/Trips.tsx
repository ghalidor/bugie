import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceIcon, { isDeliveryTrip } from '../../components/ServiceIcon';
import FromBadge from '../../components/FromBadge';
import TripPhotos from '../../components/TripPhotos';
import TripRouteMap from '../../components/TripRouteMap';
import { API, apiFetch, ApiError, driversFileUrl, personPhotoUrl } from '../../state/api';
import {
  Drawer, EmptyState, InfoList, Modal, Notice, Page, Pagination, SectionCard, Skeleton, StatCard, StatGrid, StatusBadge,
  useClientPage, useConfirm, useToast,
} from '../../components/ui';
import { fmtDateTime, fmtTime, money, payMethod, tripStatus } from '../../components/tripFormat';

interface EnrichedTrip {
  id: string;
  passengerId: string;
  driverId: string | null;
  originAddress: string;
  originLat: number; originLng: number;
  destAddress: string;
  destLat: number; destLng: number;
  estimatedFare: number;
  finalFare: number | null;
  paymentMethod: string;
  status: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  driverFullName:     string | null;
  driverPhotoUrl:     string | null;
  driverRating:       number | null;
  driverTotalRatings: number | null;
  vehiclePlate:    string | null;
  vehicleBrand:    string | null;
  vehicleModel:    string | null;
  vehicleColor:    string | null;
  vehicleYear:     number | null;
  vehiclePhotoUrl: string | null;
  category: 'city_ride' | 'delivery';
  serviceType?: number;

  // Envio de paquete (solo si category === 'delivery')
  packageDescription?: string | null;
  packageWeightKg?:    number | null;
  packageIsFragile?:   boolean | null;
  packageDetails?:     string | null;
  recipientName?:      string | null;
  recipientPhone?:     string | null;
  pickupVerified?:     boolean | null;
  deliveryReceivedBy?: string | null;
  deliveryConfirmedAt?: string | null;

  // Si se cancelo: quien ('passenger' | 'driver' | 'admin') y por que
  cancelledBy?:  string | null;
  cancelReason?: string | null;

  // Programado: hora de Perú (sin zona). null = viaje "ahora".
  scheduledAt?:     string | null;
  driverArrivedAt?: string | null;
  // El conductor no llegó (15 min después de la hora): cancelar o republicar
  driverLate?:      boolean;
}

/** "sáb 04 oct, 10:30" de una fecha de la API (hora de Perú sin zona). */
function fmtScheduled(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('es-PE', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Programado que todavía no terminó (pendiente, negociando o aceptado sin iniciar). */
const isUpcomingScheduled = (t: EnrichedTrip) => !!t.scheduledAt && [1, 2, 7].includes(t.status);

interface Incident {
  id: string;
  tripId: string;
  reportedByUserId: string;
  reportedByRole: string;
  description: string;
  createdAt: string;
  reportedByName?: string | null;
}

interface Rating {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  driverId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

const CANCELLED_BY_TEXT: Record<string, string> = {
  passenger: 'Lo cancelaste tú',
  driver:    'Lo canceló el conductor',
  admin:     'Lo canceló Bugie',
};

type Filter = 'all' | 'city_ride' | 'delivery' | 'scheduled';
const PAGE_SIZE = 12;

function groupByDay(trips: EnrichedTrip[]): { key: string; day: string; trips: EnrichedTrip[] }[] {
  const map = new Map<string, { date: Date; trips: EnrichedTrip[] }>();
  trips.forEach(t => {
    const d = new Date(t.createdAt);
    // Dia de la fecha tal como la manda el backend (hora de Peru), no en UTC.
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { date: d, trips: [] });
    map.get(key)!.trips.push(t);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => ({
      key,
      day: v.date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }),
      trips: v.trips,
    }));
}

const byDateDesc = (a: EnrichedTrip, b: EnrichedTrip) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
const categoryOf = (t: EnrichedTrip) => t.category ?? (t.serviceType === 1 ? 'delivery' : 'city_ride');

export default function PassengerTrips() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trips,     setTrips]     = useState<EnrichedTrip[]>([]);
  const [myReports, setMyReports] = useState<Record<string, Incident | null>>({});
  const [myRatings, setMyRatings] = useState<Record<string, Rating | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<Filter>('all');
  const [selected,  setSelected]  = useState<EnrichedTrip | null>(null);
  const [reportingTrip, setReportingTrip] = useState<EnrichedTrip | null>(null);
  const [ratingTrip,    setRatingTrip]    = useState<EnrichedTrip | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    apiFetch<EnrichedTrip[]>(`${API.trips}/trips/history/enriched`)
      .then(async list => {
        setTrips(list);

        // Pedir mis incidencias por viaje en una sola llamada
        if (list.length > 0) {
          const params = list.map(t => `ids=${t.id}`).join('&');
          try {
            const map = await apiFetch<Record<string, Incident | null>>(
              `${API.trips}/trips/incidents/me/by-trips?${params}`);
            setMyReports(map ?? {});
          } catch {
            // Si falla, los botones se mostrarán como "Reportar"
          }

          // Ratings en una sola llamada batch (solo viajes completados).
          const completedIds = list.filter(t => t.status === 4).map(t => t.id);
          if (completedIds.length > 0) {
            try {
              const qs = completedIds.map(id => `ids=${id}`).join('&');
              const map = await apiFetch<Record<string, Rating>>(
                `${API.trips}/trips/ratings/me/by-trips?${qs}`);
              // El backend solo devuelve los que tienen rating; los demás van en null.
              const ratingMap: Record<string, Rating | null> = {};
              for (const id of completedIds) ratingMap[id] = map?.[id] ?? null;
              setMyRatings(ratingMap);
            } catch {
              // Si falla, los botones se mostrarán como "Calificar"
            }
          }
        }
      })
      .catch(() => setError('No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  // ── Programados: cancelar o republicar ──────────────────────────────
  async function cancelScheduled(t: EnrichedTrip) {
    const delivery = isDeliveryTrip(t);
    const ok = await confirm({
      title: delivery ? '¿Cancelar el envío programado?' : '¿Cancelar el viaje programado?',
      message: t.driverLate
        ? 'Tu conductor no llegó a la hora programada: puedes cancelar sin penalidad.'
        : t.driverId ? 'Avisaremos a tu conductor que cancelaste.' : 'Dejarás de recibir propuestas de conductores.',
      confirmText: 'Sí, cancelar',
      cancelText: 'No',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(t.id);
    try {
      await apiFetch(`${API.trips}/trips/${t.id}/cancel`, { method: 'PUT' });
      toast.success(delivery ? 'Cancelaste el envío programado.' : 'Cancelaste el viaje programado.');
      setSelected(null);
      setReloadKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cancelar.');
    } finally { setBusyId(null); }
  }

  async function republishScheduled(t: EnrichedTrip) {
    const ok = await confirm({
      title: '¿Republicar?',
      message: 'Quitaremos a tu conductor y otros conductores podrán enviarte propuestas de nuevo.',
      confirmText: 'Sí, republicar',
      cancelText: 'No, esperar',
      tone: 'warning',
    });
    if (!ok) return;
    setBusyId(t.id);
    try {
      await apiFetch(`${API.trips}/trips/${t.id}/republish`, { method: 'PUT' });
      toast.success('Listo: los conductores ya pueden verlo de nuevo.');
      navigate(`/app/pasajero/seguimiento?trip=${t.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo republicar.');
    } finally { setBusyId(null); }
  }

  const filtered = useMemo(() => {
    const list = filter === 'all' ? trips
      : filter === 'scheduled' ? trips.filter(t => !!t.scheduledAt)
      : trips.filter(t => categoryOf(t) === filter);
    return [...list].sort(byDateDesc);
  }, [trips, filter]);
  // Próximos programados (arriba de la lista), por hora
  const upcoming = useMemo(() => trips.filter(isUpcomingScheduled)
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')), [trips]);

  const { page, setPage, items } = useClientPage(filtered, PAGE_SIZE, filter);
  const grouped = useMemo(() => groupByDay(items), [items]);

  const completed  = trips.filter(t => t.status === 4);
  const deliveries = trips.filter(t => categoryOf(t) === 'delivery').length;
  const totalSpent = completed.reduce((s, t) => s + (t.finalFare ?? t.estimatedFare), 0);

  function handleReported(tripId: string, incident: Incident) {
    setMyReports(prev => ({ ...prev, [tripId]: incident }));
    setReportingTrip(null);
    toast.success('Tu reporte llegó al equipo de monitoreo.');
  }

  function handleRated(tripId: string, rating: Rating) {
    setMyRatings(prev => ({ ...prev, [tripId]: rating }));
    setRatingTrip(null);
    toast.success('¡Gracias por calificar!');
  }

  const chips: { key: Filter; label: string; icon: string; count: number }[] = [
    { key: 'all',       label: 'Todos',            icon: 'fa-bars', count: trips.length },
    { key: 'city_ride', label: 'Viajes en ciudad', icon: 'fa-car',  count: trips.length - deliveries },
    { key: 'delivery',  label: 'Envíos',           icon: 'fa-box',  count: deliveries },
    { key: 'scheduled', label: 'Programados',      icon: 'fa-calendar-days', count: trips.filter(t => !!t.scheduledAt).length },
  ];

  return (
    <Page
      title="Mis viajes"
      subtitle="Historial de tus viajes y envíos. Toca uno para ver el detalle."
      icon="fa-clock-rotate-left"
      actions={[{ label: 'Pedir viaje', icon: 'fa-route', variant: 'primary', to: '/app/pasajero/solicitar' }]}
    >
      {error && <Notice tone="bad">{error}</Notice>}

      <StatGrid min={160}>
        <StatCard label="Viajes y envíos" value={trips.length} icon="fa-route" loading={loading} />
        <StatCard label="Completados" value={completed.length} icon="fa-circle-check" tone="ok" loading={loading} />
        <StatCard label="Total gastado" value={money(totalSpent)} icon="fa-wallet" tone="info" loading={loading} />
      </StatGrid>

      <div className="bx-chips" role="group" aria-label="Filtrar por tipo">
        {chips.map(c => (
          <button key={c.key} type="button" className="bx-chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
            <i className={`fa-solid ${c.icon}`} aria-hidden="true" />{c.label}
            {!loading && <span className="count">{c.count}</span>}
          </button>
        ))}
      </div>

      {/* Próximos programados: hora, estado y acciones */}
      {!loading && upcoming.length > 0 && (
        <SectionCard title="Próximos programados" icon="fa-calendar-days"
          description="Puedes verlos, cancelarlos o republicarlos si el conductor no llegó.">
          <div className="bx-rows">
            {upcoming.map(t => (
              <div key={t.id} className="bx-row">
                <span className={`bx-list-icon bx-tone-${t.driverLate ? 'bad' : t.driverId ? 'ok' : 'warn'}`} aria-hidden="true">
                  <i className={`fa-solid ${isDeliveryTrip(t) ? 'fa-box' : 'fa-car'}`} />
                </span>
                <div className="bx-list-text">
                  <span className="bx-list-title d-block">Programado para el {fmtScheduled(t.scheduledAt!)}</span>
                  <span className="bx-list-sub d-block text-truncate">{t.originAddress} → {t.destAddress}</span>
                  <span className={`bx-list-sub d-block ${t.driverLate ? 'bx-text-bad' : t.driverId ? 'bx-text-ok' : 'bx-text-warn'}`}>
                    {t.driverLate ? 'Tu conductor no llegó'
                      : t.driverId ? `Conductor asignado${t.driverFullName ? `: ${t.driverFullName}` : ''}`
                      : t.status === 7 ? 'Recibiendo propuestas' : 'Buscando conductor'}
                  </span>
                </div>
                <div className="bx-list-end d-flex gap-2 flex-wrap justify-content-end">
                  <button type="button" className="btn btn-sm btn-bugie-outline"
                          onClick={() => navigate(`/app/pasajero/seguimiento?trip=${t.id}`)}>
                    <i className="fa-solid fa-location-dot" aria-hidden="true" />Ver
                  </button>
                  {t.driverLate && (
                    <button type="button" className="btn btn-sm btn-bugie" disabled={busyId === t.id}
                            onClick={() => republishScheduled(t)}>
                      <i className="fa-solid fa-rotate" aria-hidden="true" />Republicar
                    </button>
                  )}
                  {!t.driverArrivedAt && (
                    <button type="button" className="btn btn-sm btn-outline-danger" disabled={busyId === t.id}
                            onClick={() => cancelScheduled(t)}>
                      <i className="fa-solid fa-xmark" aria-hidden="true" />{t.driverLate ? 'Cancelar sin penalidad' : 'Cancelar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {loading ? (
        <div className="bx-rows">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={76} radius={14} />)}
        </div>
      ) : filtered.length === 0 ? (
        <SectionCard>
          {filter === 'scheduled'
            ? <EmptyState icon="fa-calendar-days" title="Sin programados" text="Al pedir un viaje o envío elige «Programar» para reservarlo con anticipación." />
            : filter === 'delivery'
            ? <EmptyState icon="fa-box" title="Sin envíos aún" text="Tus envíos de paquetes aparecerán aquí una vez que los solicites." />
            : <EmptyState icon="fa-route" title="Sin viajes aún" text="Tus viajes aparecerán aquí una vez que los realices." />}
        </SectionCard>
      ) : (
        <div className="bx-stack">
          {grouped.map(g => (
            <section key={g.key} aria-label={g.day}>
              <h2 className="bx-group-title text-capitalize">{g.day} <span className="count">{g.trips.length}</span></h2>
              <div className="bx-rows">
                {g.trips.map(t => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    hasMyIncident={!!myReports[t.id]}
                    onClick={() => setSelected(t)}
                    onReport={() => setReportingTrip(t)}
                  />
                ))}
              </div>
            </section>
          ))}
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </div>
      )}

      {/* Detalle */}
      <TripDetailDrawer
        trip={selected}
        myIncident={selected ? myReports[selected.id] ?? null : null}
        myRating={selected ? myRatings[selected.id] ?? null : null}
        onClose={() => setSelected(null)}
        onReport={() => { const t = selected; setSelected(null); setReportingTrip(t); }}
        onRate={() => { const t = selected; setSelected(null); setRatingTrip(t); }}
        busy={!!selected && busyId === selected.id}
        onTrack={() => { if (selected) navigate(`/app/pasajero/seguimiento?trip=${selected.id}`); }}
        onCancelScheduled={() => { if (selected) cancelScheduled(selected); }}
        onRepublish={() => { if (selected) republishScheduled(selected); }}
      />

      {reportingTrip && (
        <ReportIncidentModal
          trip={reportingTrip}
          existing={myReports[reportingTrip.id] ?? null}
          onClose={() => setReportingTrip(null)}
          onSaved={inc => handleReported(reportingTrip.id, inc)}
        />
      )}

      {ratingTrip && (
        <RateTripModal
          trip={ratingTrip}
          onClose={() => setRatingTrip(null)}
          onSaved={r => handleRated(ratingTrip.id, r)}
        />
      )}
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────
function TripRow({ trip, hasMyIncident, onClick, onReport }: {
  trip: EnrichedTrip;
  hasMyIncident: boolean;
  onClick: () => void;
  onReport: () => void;
}) {
  const fare = trip.finalFare ?? trip.estimatedFare;
  const delivery = isDeliveryTrip(trip);
  const st = tripStatus(trip.status);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Ver detalle: ${trip.originAddress} a ${trip.destAddress}`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="bx-row clickable"
    >
      <span className={`bx-list-icon bx-tone-${delivery ? 'warn' : 'primary'}`} aria-hidden="true">
        <i className={`fa-solid ${delivery ? 'fa-box' : 'fa-car'}`} />
      </span>

      <div className="bx-list-text">
        <ol className="bx-stops compact">
          <li><span className="addr">{trip.originAddress}</span></li>
          <li className="dest"><span className="addr">{trip.destAddress}</span></li>
        </ol>
        <div className="bx-list-sub d-flex align-items-center gap-2 flex-wrap mt-1">
          <StatusBadge tone={st.tone} size="sm">{st.label}</StatusBadge>
          {trip.scheduledAt && (
            <StatusBadge tone="info" size="sm" icon="fa-calendar-days">Programado para el {fmtScheduled(trip.scheduledAt)}</StatusBadge>
          )}
          <span>{fmtTime(trip.createdAt)}</span>
          {delivery && trip.packageDescription && <span className="bx-truncate">· {trip.packageDescription}</span>}
        </div>
      </div>

      <div className="bx-list-end flex-column align-items-end">
        <span className="amount">{money(fare)}</span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onReport(); }}
          className={`btn btn-sm ${hasMyIncident ? 'btn-outline-warning' : 'btn-bugie-outline'}`}
          title={hasMyIncident ? 'Ver mi incidencia' : 'Reportar incidencia'}
        >
          <i className={`fa-solid ${hasMyIncident ? 'fa-triangle-exclamation' : 'fa-flag'}`} aria-hidden="true" />
          {hasMyIncident ? 'Ver incidencia' : 'Reportar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Detalle del viaje en un panel lateral (pantalla completa en móvil)
// ─────────────────────────────────────────────────────────────────────
function TripDetailDrawer({ trip, myIncident, myRating, onClose, onReport, onRate, busy, onTrack, onCancelScheduled, onRepublish }: {
  trip: EnrichedTrip | null;
  myIncident: Incident | null;
  myRating: Rating | null;
  onClose: () => void;
  onReport: () => void;
  onRate: () => void;
  busy: boolean;
  onTrack: () => void;
  onCancelScheduled: () => void;
  onRepublish: () => void;
}) {
  // Conserva el último viaje mientras se anima la salida
  const [last, setLast] = useState<EnrichedTrip | null>(trip);
  useEffect(() => { if (trip) setLast(trip); }, [trip]);
  const t = trip ?? last;

  return (
    <Drawer
      open={!!trip}
      onClose={onClose}
      size="md"
      title={t ? (isDeliveryTrip(t) ? 'Envío de paquete' : 'Viaje en ciudad') : ''}
      description={t ? fmtDateTime(t.createdAt) : undefined}
      footer={t && (
        <>
          {/* Programado vigente: seguimiento, cancelar y republicar */}
          {isUpcomingScheduled(t) && (
            <>
              <button type="button" className="btn btn-bugie-outline" onClick={onTrack}>
                <i className="fa-solid fa-location-dot" aria-hidden="true" />Ver seguimiento
              </button>
              {t.driverLate && (
                <button type="button" className="btn btn-bugie" onClick={onRepublish} disabled={busy}>
                  <i className="fa-solid fa-rotate" aria-hidden="true" />Republicar
                </button>
              )}
              {!t.driverArrivedAt && (
                <button type="button" className="btn btn-outline-danger" onClick={onCancelScheduled} disabled={busy}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />{t.driverLate ? 'Cancelar sin penalidad' : 'Cancelar'}
                </button>
              )}
            </>
          )}
          <button type="button" onClick={onReport}
                  className={`btn ${myIncident ? 'btn-bugie-outline' : 'btn-outline-warning'}`}>
            <i className="fa-solid fa-flag" aria-hidden="true" />
            {myIncident ? 'Ver mi incidencia' : 'Reportar incidencia'}
          </button>
          {t.status === 4 && !myRating && (
            <button type="button" onClick={onRate} className="btn btn-bugie">
              <i className="fa-solid fa-star" aria-hidden="true" />Calificar al conductor
            </button>
          )}
        </>
      )}
    >
      {t && <TripDetailBody trip={t} myIncident={myIncident} myRating={myRating} />}
    </Drawer>
  );
}

function TripDetailBody({ trip, myIncident, myRating }: { trip: EnrichedTrip; myIncident: Incident | null; myRating: Rating | null }) {
  const st     = tripStatus(trip.status);
  const fare   = trip.finalFare ?? trip.estimatedFare;
  const delivery = isDeliveryTrip(trip);
  const startedAt   = trip.startedAt   ? new Date(trip.startedAt) : null;
  const completedAt = trip.completedAt ? new Date(trip.completedAt) : null;
  const durationMin = (startedAt && completedAt)
    ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
    : null;
  const distanceKm = haversineKm(trip.originLat, trip.originLng, trip.destLat, trip.destLng);

  return (
    <div className="bx-stack">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <ServiceIcon delivery={delivery} />
        <StatusBadge tone={st.tone} icon={st.icon}>{st.label}</StatusBadge>
      </div>

      {/* Foto del vehículo */}
      <div className="bx-media">
        {trip.vehiclePhotoUrl
          ? <img src={driversFileUrl(trip.vehiclePhotoUrl)} alt="Vehículo del viaje" />
          : <div className="text-center"><i className="fa-solid fa-car fa-2x d-block mb-2" aria-hidden="true" /><span className="small">Sin foto del vehículo</span></div>}
      </div>

      {/* Programado */}
      {trip.scheduledAt && (
        <Notice tone={trip.driverLate ? 'bad' : 'info'} icon="fa-calendar-days"
                title={`Programado para el ${fmtScheduled(trip.scheduledAt)}`}>
          {trip.driverLate
            ? 'Tu conductor no llegó a la hora: puedes cancelar sin penalidad o republicarlo.'
            : isUpcomingScheduled(trip)
              ? (trip.driverId ? 'Conductor asignado. Te recordaremos 30 y 10 minutos antes.' : 'Los conductores pueden enviarte propuestas desde ahora.')
              : 'Este viaje se pidió con anticipación.'}
        </Notice>
      )}

      {/* Cancelado: quién y por qué */}
      {trip.status === 5 && (
        <Notice
          tone="neutral" icon="fa-circle-xmark"
          title={<span className="d-inline-flex align-items-center gap-2 flex-wrap">
            {CANCELLED_BY_TEXT[trip.cancelledBy ?? ''] ?? (delivery ? 'Envío cancelado' : 'Viaje cancelado')}
            {trip.cancelledBy && <FromBadge by={trip.cancelledBy} />}
          </span>}
        >
          Motivo: {trip.cancelReason || 'Sin motivo indicado'}
        </Notice>
      )}

      <div className="bx-box">
        <ol className="bx-stops">
          <li><span className="lbl">Origen · {fmtTime(trip.createdAt)}</span><span className="addr">{trip.originAddress}</span></li>
          <li className="dest">
            <span className="lbl">Destino · {completedAt ? completedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            <span className="addr">{trip.destAddress}</span>
          </li>
        </ol>
      </div>

      {/* Ruta del sistema vs recorrido real del conductor */}
      {trip.driverId && (
        <TripRouteMap tripId={trip.id} realPathUrl={`${API.trips}/trips/${trip.id}/real-path`} realLabel="Recorrido del conductor" />
      )}

      <div className="bx-mini-stats">
        <div className="bx-box"><div className="l"><i className="fa-solid fa-clock me-1" aria-hidden="true" />Duración</div><div className="v">{durationMin !== null ? `${durationMin} min` : '—'}</div></div>
        <div className="bx-box"><div className="l"><i className="fa-solid fa-route me-1" aria-hidden="true" />Distancia</div><div className="v">{distanceKm.toFixed(1)} km</div></div>
      </div>

      {/* Envío: paquete, destinatario, entrega y fotos */}
      {delivery && (
        <div className="bx-box">
          <div className="bx-box-title"><i className="fa-solid fa-box" aria-hidden="true" />Paquete y entrega</div>
          <InfoList items={[
            { label: 'Descripción', value: trip.packageDescription || '—', wide: true },
            { label: 'Peso', value: `${trip.packageWeightKg} kg`, hidden: trip.packageWeightKg == null },
            { label: 'Frágil', value: trip.packageIsFragile ? 'Sí' : 'No' },
            { label: 'Detalles', value: trip.packageDetails, wide: true, hidden: !trip.packageDetails },
            { label: 'Destinatario', value: trip.recipientName || '—' },
            { label: 'Teléfono', value: trip.recipientPhone || '—' },
            { label: 'Entrega', wide: true, value: trip.deliveryConfirmedAt
                ? <>Recibió <strong>{trip.deliveryReceivedBy || '—'}</strong>, el {fmtDateTime(trip.deliveryConfirmedAt)}</>
                : <span className="bx-muted">{trip.pickupVerified ? 'Paquete recogido y verificado, sin entrega confirmada.' : 'Sin entrega confirmada.'}</span> },
          ]} />
          <div className="bx-box-title mt-3"><i className="fa-solid fa-images" aria-hidden="true" />Fotos</div>
          <TripPhotos tripId={trip.id} />
        </div>
      )}

      {/* Conductor */}
      {trip.driverId && (
        <div className="bx-box d-flex align-items-center gap-3">
          <span className="bx-avatar lg" aria-hidden="true">
            {trip.driverPhotoUrl ? <img src={personPhotoUrl(trip.driverPhotoUrl)} alt="" /> : <i className="fa-solid fa-user" />}

          </span>
          <div style={{ minWidth: 0 }}>
            <div className="fw-semibold text-break">{trip.driverFullName ?? 'Conductor'}</div>
            <div className="small bx-muted text-break">
              {[trip.vehicleColor, trip.vehicleBrand, trip.vehicleModel].filter(Boolean).join(' ')}
              {trip.vehiclePlate && <strong className="ms-2">{trip.vehiclePlate}</strong>}
            </div>
            {trip.driverRating !== null && (
              <div className="small d-flex align-items-center gap-1">
                <i className="fa-solid fa-star" style={{ color: '#f59e0b' }} aria-hidden="true" />
                <strong>{trip.driverRating.toFixed(1)}</strong>
                <span className="bx-muted">({trip.driverTotalRatings ?? 0})</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pago */}
      <div className="bx-box">
        <div className="bx-kv"><span>Tarifa</span><span>{money(trip.estimatedFare)}</span></div>
        {trip.finalFare !== null && trip.finalFare !== trip.estimatedFare && (
          <div className="bx-kv"><span>Tarifa final</span><span>{money(trip.finalFare)}</span></div>
        )}
        <div className="bx-kv total"><span>Total ({payMethod(trip.paymentMethod).label})</span><span>{money(fare)}</span></div>
      </div>

      {myIncident && (
        <Notice tone="warn" icon="fa-triangle-exclamation" title="Tu incidencia">
          {myIncident.description}
          <div className="small bx-muted mt-1">Reportada el {fmtDateTime(myIncident.createdAt)}</div>
        </Notice>
      )}

      {trip.status === 4 && myRating && (
        <div className="bx-box">
          <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
            <span className="fw-bold">Tu calificación</span>
            <span className="bx-stars" aria-label={`${myRating.stars} de 5 estrellas`}>
              {[1, 2, 3, 4, 5].map(s => <i key={s} className={`fa-solid fa-star ${s <= myRating.stars ? '' : 'off'}`} aria-hidden="true" />)}
            </span>
            <span className="ms-auto small bx-muted">{new Date(myRating.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
          {myRating.comment && <div className="bx-quote">“{myRating.comment}”</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ReportIncidentModal({ trip, existing, onClose, onSaved }: {
  trip: EnrichedTrip;
  existing: Incident | null;
  onClose: () => void;
  onSaved: (inc: Incident) => void;
}) {
  const [text, setText]       = useState(existing?.description ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const readonly = !!existing;

  async function submit() {
    if (text.trim().length < 5) {
      setError('Escribe al menos 5 caracteres.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const inc = await apiFetch<Incident>(
        `${API.trips}/trips/incidents/${trip.id}`,
        {
          method: 'POST',
          body: JSON.stringify({ description: text.trim() }),
        });
      onSaved(inc);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la incidencia.');
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      dirty={readonly ? false : 'auto'}
      title={readonly ? 'Mi incidencia' : 'Reportar incidencia'}
      description={`${trip.originAddress} → ${trip.destAddress}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-bugie-outline" disabled={saving}>
            {readonly ? 'Cerrar' : 'Cancelar'}
          </button>
          {!readonly && (
            <button type="button" onClick={submit} disabled={saving || text.trim().length < 5} className="btn btn-warning">
              {saving
                ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Enviando…</>
                : <><i className="fa-solid fa-paper-plane" aria-hidden="true" />Enviar</>}
            </button>
          )}
        </>
      }
    >
      <div className="bx-field">
        <label className="bx-field-label" htmlFor="incident-text">
          {readonly ? 'Lo que reportaste' : 'Cuéntanos qué pasó'}
        </label>
        <textarea
          id="incident-text"
          className="form-control"
          rows={5}
          maxLength={1000}
          placeholder="Describe la incidencia…"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={readonly || saving}
          style={{ resize: 'vertical' }}
        />
        {!readonly && (
          <p className="bx-field-help d-flex justify-content-between gap-2">
            <span>Tu reporte llega al equipo de monitoreo.</span><span>{text.length}/1000</span>
          </p>
        )}
      </div>
      {error && <Notice tone="bad" className="mt-2">{error}</Notice>}
    </Modal>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────
// Calificación: 5 estrellas + comentario opcional.
// Solo para viajes status === 4 (Completed) sin rating previo.
// ─────────────────────────────────────────────────────────────────────
function RateTripModal({ trip, onClose, onSaved }: {
  trip: EnrichedTrip;
  onClose: () => void;
  onSaved: (r: Rating) => void;
}) {
  const [stars, setStars]     = useState(0);     // 0 = no eligió
  const [hover, setHover]     = useState(0);     // estrella bajo el mouse
  const [comment, setComment] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function label(n: number): string {
    switch (n) {
      case 1: return 'Muy mal viaje';
      case 2: return 'Regular';
      case 3: return 'Aceptable';
      case 4: return 'Bueno';
      case 5: return '¡Excelente!';
      default: return '¿Cómo fue tu viaje?';
    }
  }

  async function submit() {
    if (stars < 1) {
      setError('Selecciona al menos 1 estrella.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const r = await apiFetch<Rating>(
        `${API.trips}/trips/ratings/${trip.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            stars,
            comment: comment.trim() === '' ? null : comment.trim(),
          }),
        });
      onSaved(r);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la calificación.');
    } finally { setSaving(false); }
  }

  const display = hover > 0 ? hover : stars;

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      dirty="auto"

      title="Calificar al conductor"
      description={`${trip.originAddress} → ${trip.destAddress}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-bugie-outline" disabled={saving}>Cancelar</button>
          <button type="button" onClick={submit} className="btn btn-bugie" disabled={saving || stars < 1}>
            {saving
              ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              : <i className="fa-solid fa-paper-plane" aria-hidden="true" />}
            Enviar
          </button>
        </>
      }
    >
      <div className="bx-star-picker" role="radiogroup" aria-label="Estrellas" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s}
            type="button"
            role="radio"
            aria-checked={stars === s}
            onClick={() => setStars(s)}
            onMouseEnter={() => setHover(s)}
            disabled={saving}
            className={s <= display ? 'on' : ''}
            aria-label={`${s} estrella${s > 1 ? 's' : ''}`}>
            <i className={`fa-${s <= display ? 'solid' : 'regular'} fa-star`} aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="text-center small bx-muted mt-1 mb-3" aria-live="polite">{label(display)}</p>

      <div className="bx-field">
        <label className="bx-field-label" htmlFor="rate-comment">Comentario <span className="bx-field-opt">(opcional)</span></label>
        <textarea
          id="rate-comment"
          className="form-control"
          rows={3}
          maxLength={500}
          disabled={saving}
          value={comment}
          placeholder="Cuéntanos cómo fue tu experiencia…"
          onChange={e => setComment(e.target.value)}
        />
        <p className="bx-field-help text-end">{comment.length}/500</p>
      </div>

      {error && <Notice tone="bad" className="mt-2">{error}</Notice>}
    </Modal>
  );
}
