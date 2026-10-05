import { useEffect, useMemo, useState } from 'react';
import ServiceIcon from '../../components/ServiceIcon';
import FromBadge from '../../components/FromBadge';
import TripPhotos from '../../components/TripPhotos';
import TripRouteMap from '../../components/TripRouteMap';
import { API, apiFetch } from '../../state/api';
import {
  Drawer, EmptyState, InfoList, Modal, Notice, Page, PageLoading, Pagination, SectionCard,
  StatCard, StatGrid, StatusBadge, useClientPage, useToast,
} from '../../components/ui';
import { fmtDateTime, money, payMethod, tripStatus } from '../../components/tripFormat';

interface Trip {
  id: string; originAddress: string; destAddress: string;
  finalFare: number | null; estimatedFare: number;
  paymentMethod: string; status: number;
  createdAt: string; completedAt: string | null;
  // Privacidad: el backend manda solo las INICIALES del pasajero (ej. "L. M.")
  passengerName?: string | null;

  // 0 = viaje, 1 = envío de paquete
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
  // Si se cancelo: quien ('passenger' | 'driver' | 'admin') y por que
  cancelledBy?: string | null;
  cancelReason?: string | null;
}

type Filter = 'all' | 'ride' | 'delivery';
const PAGE_SIZE = 10;

const CANCELLED_BY_TEXT: Record<string, string> = {
  passenger: 'Lo canceló el pasajero',
  driver:    'Lo cancelaste tú',
  admin:     'Lo canceló Bugie',
};

interface Incident {
  id: string; tripId: string; reportedByUserId: string;
  reportedByRole: string; description: string; createdAt: string;
}

export default function DriverTrips() {
  const toast = useToast();
  const [trips,     setTrips]     = useState<Trip[]>([]);
  const [myReports, setMyReports] = useState<Record<string, Incident | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [reportingTrip, setReportingTrip] = useState<Trip | null>(null);
  const [detailTrip,    setDetailTrip]    = useState<Trip | null>(null);
  const [filter,        setFilter]        = useState<Filter>('all');

  useEffect(() => {
    apiFetch<Trip[]>(`${API.trips}/trips/history`)
      .then(async list => {
        setTrips(list);
        if (list.length > 0) {
          const params = list.map(t => `ids=${t.id}`).join('&');
          try {
            const map = await apiFetch<Record<string, Incident | null>>(
              `${API.trips}/trips/incidents/me/by-trips?${params}`);
            setMyReports(map ?? {});
          } catch {}
        }
      })
      .catch(() => setError('No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  }, []);

  // Filtro Todos / Viajes / Envíos
  const visible = useMemo(() => trips.filter(t =>
    filter === 'all' ? true : filter === 'delivery' ? t.serviceType === 1 : t.serviceType !== 1), [trips, filter]);
  const { page, setPage, items } = useClientPage(visible, PAGE_SIZE, filter);

  if (loading) return <PageLoading />;

  const completed   = trips.filter(t => t.status === 4);
  const totalGanado = completed.reduce((s, t) => s + (t.finalFare ?? t.estimatedFare), 0);
  const deliveries  = trips.filter(t => t.serviceType === 1).length;

  function handleReported(tripId: string, inc: Incident) {
    setMyReports(prev => ({ ...prev, [tripId]: inc }));
    setReportingTrip(null);
    toast.success('Tu reporte llegó al equipo de monitoreo.');
  }

  const chips: { key: Filter; label: string; icon: string; count: number }[] = [
    { key: 'all',      label: 'Todos',  icon: 'fa-bars', count: trips.length },
    { key: 'ride',     label: 'Viajes', icon: 'fa-car',  count: trips.length - deliveries },
    { key: 'delivery', label: 'Envíos', icon: 'fa-box',  count: deliveries },
  ];

  return (
    <Page title="Historial de viajes" subtitle="Tus viajes y envíos. Abre uno para ver su recorrido en el mapa." icon="fa-clock-rotate-left">
      {error && <Notice tone="bad">{error}</Notice>}

      {trips.length > 0 && (
        <StatGrid min={160}>
          <StatCard label="Total viajes" value={trips.length} icon="fa-route" />
          <StatCard label="Completados" value={completed.length} icon="fa-circle-check" tone="ok" />
          <StatCard label="Total ganado" value={money(totalGanado)} icon="fa-wallet" tone="info" />
        </StatGrid>
      )}

      {trips.length > 0 && (
        <div className="bx-chips" role="group" aria-label="Filtrar por tipo">
          {chips.map(c => (
            <button key={c.key} type="button" className="bx-chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
              <i className={`fa-solid ${c.icon}`} aria-hidden="true" />{c.label}<span className="count">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={filter === 'delivery' ? 'fa-box' : 'fa-route'}
            title={filter === 'delivery' ? 'Sin envíos aún' : 'Sin viajes aún'}
            text={filter === 'delivery'
              ? 'Tus envíos aparecerán aquí una vez que los completes.'
              : 'Tus viajes aparecerán aquí una vez que los completes.'}
          />
        </SectionCard>
      ) : (
        <div className="bx-stack">
          <div className="bx-rows">
            {items.map(t => {
              const s    = tripStatus(t.status);
              const pay  = payMethod(t.paymentMethod);
              const fare = t.finalFare ?? t.estimatedFare;
              const hasIncident = !!myReports[t.id];

              return (
                <div key={t.id} className="bx-row clickable" role="button" tabIndex={0}
                     aria-label={`Ver detalle: ${t.originAddress} a ${t.destAddress}`}
                     onClick={() => setDetailTrip(t)}
                     onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailTrip(t); } }}>
                  <span className={`bx-list-icon bx-tone-${s.tone}`} aria-hidden="true">
                    <i className={`fa-solid ${s.icon}`} />
                  </span>
                  <div className="bx-list-text">
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                      <StatusBadge tone={s.tone} size="sm">{s.label}</StatusBadge>
                      <ServiceIcon delivery={t.serviceType === 1} />
                      <span className="bx-list-sub">{fmtDateTime(t.createdAt)}</span>
                      {t.passengerName && (
                        <span className="bx-list-sub"><i className="fa-solid fa-user me-1" aria-hidden="true" />{t.passengerName}</span>
                      )}
                    </div>
                    <ol className="bx-stops compact">
                      <li><span className="addr">{t.originAddress}</span></li>
                      <li className="dest"><span className="addr">{t.destAddress}</span></li>
                    </ol>
                  </div>
                  <div className="bx-list-end flex-column align-items-end">
                    {t.status === 4 ? (
                      <>
                        <span className="amount bx-text-ok">{money(fare)}</span>
                        <span className="bx-list-sub"><i className={`fa-solid ${pay.icon} me-1`} aria-hidden="true" />{pay.label}</span>
                      </>
                    ) : <span className="bx-muted">—</span>}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setReportingTrip(t); }}
                      className={`btn btn-sm ${hasIncident ? 'btn-outline-warning' : 'btn-bugie-outline'}`}>
                      <i className={`fa-solid ${hasIncident ? 'fa-triangle-exclamation' : 'fa-flag'}`} aria-hidden="true" />
                      {hasIncident ? 'Ver incidencia' : 'Reportar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPage} />
        </div>
      )}

      {reportingTrip && (
        <ReportIncidentModal
          trip={reportingTrip}
          existing={myReports[reportingTrip.id] ?? null}
          onClose={() => setReportingTrip(null)}
          onSaved={inc => handleReported(reportingTrip.id, inc)}
        />
      )}

      <TripDetailDrawer trip={detailTrip} onClose={() => setDetailTrip(null)} />
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Detalle de un viaje/envío: recorrido, pago y, si es envío, paquete,
// destinatario, entrega y fotos. Si se canceló: quién y por qué.
// ─────────────────────────────────────────────────────────────────────
function TripDetailDrawer({ trip, onClose }: { trip: Trip | null; onClose: () => void }) {
  const [last, setLast] = useState<Trip | null>(trip);
  useEffect(() => { if (trip) setLast(trip); }, [trip]);
  const t = trip ?? last;
  const delivery = t?.serviceType === 1;

  return (
    <Drawer
      open={!!trip}
      onClose={onClose}
      size="md"
      title={delivery ? 'Detalle del envío' : 'Detalle del viaje'}
      description={t ? fmtDateTime(t.createdAt) : undefined}
      footer={<button type="button" className="btn btn-bugie-outline" onClick={onClose}>Cerrar</button>}
    >
      {t && <TripDetailBody trip={t} />}
    </Drawer>
  );
}

function TripDetailBody({ trip }: { trip: Trip }) {
  const delivery = trip.serviceType === 1;
  const s    = tripStatus(trip.status);
  const pay  = payMethod(trip.paymentMethod);
  const fare = trip.finalFare ?? trip.estimatedFare;

  return (
    <div className="bx-stack">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <ServiceIcon delivery={delivery} />
        <StatusBadge tone={s.tone} icon={s.icon}>{s.label}</StatusBadge>
        {trip.passengerName && (
          <span className="small bx-muted"><i className="fa-solid fa-user me-1" aria-hidden="true" />Pasajero: {trip.passengerName}</span>
        )}
      </div>

      <div className="bx-box">
        <ol className="bx-stops">
          <li><span className="lbl">Origen</span><span className="addr">{trip.originAddress}</span></li>
          <li className="dest"><span className="lbl">Destino</span><span className="addr">{trip.destAddress}</span></li>
        </ol>
        {trip.completedAt && <p className="small bx-muted mt-2 mb-0">Completado el {fmtDateTime(trip.completedAt)}</p>}
      </div>

      {/* Ruta del sistema vs recorrido real (GPS) */}
      <TripRouteMap tripId={trip.id} realPathUrl={`${API.drivers}/drivers/me/trips/${trip.id}/path`} realLabel="Tu recorrido" />

      <div className="bx-box">
        <div className="bx-kv total m-0 p-0 border-0">
          <span><i className={`fa-solid ${pay.icon} me-1`} aria-hidden="true" />{pay.label}</span>
          <span>{money(fare)}</span>
        </div>
      </div>

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

      {/* Envío: paquete, destinatario, entrega y fotos */}
      {delivery && (
        <div className="bx-box">
          <div className="bx-box-title"><i className="fa-solid fa-box" aria-hidden="true" />Paquete y entrega</div>
          <InfoList items={[
            { label: 'Descripción', value: trip.packageDescription || '—', wide: true },
            { label: 'Peso', value: `${trip.packageWeightKg} kg`, hidden: trip.packageWeightKg == null },
            { label: 'Frágil', value: trip.packageIsFragile ? 'Sí' : 'No' },
            { label: 'Detalles', value: trip.packageDetails, wide: true, hidden: !trip.packageDetails },
            { label: 'Tu observación al recoger', value: trip.pickupObservation, wide: true, hidden: !trip.pickupObservation },
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ReportIncidentModal({ trip, existing, onClose, onSaved }: {
  trip: Trip;
  existing: Incident | null;
  onClose: () => void;
  onSaved: (inc: Incident) => void;
}) {
  const [text, setText]     = useState(existing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
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
        { method: 'POST', body: JSON.stringify({ description: text.trim() }) });
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
        <label className="bx-field-label" htmlFor="d-incident-text">
          {readonly ? 'Lo que reportaste' : 'Cuéntanos qué pasó'}
        </label>
        <textarea
          id="d-incident-text"
          className="form-control" rows={5} maxLength={1000}
          placeholder="Describe la incidencia…"
          value={text} onChange={e => setText(e.target.value)}
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
