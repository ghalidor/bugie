import { useEffect, useRef, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import TripDetailModal, { TripDetail, FromBadge, ServiceIcon } from '../../components/TripDetailModal';
import {
  Column, DataTable, Drawer, EmptyState, FilterBar, Page, Pagination, SectionCard, Skeleton,
  Select, StatCard, StatGrid, StatusBadge, Tabs, Tone, useDebouncedValue, useTabParam, useToast,
} from '../../components/ui';
import DateRangeFilter, { appendRange, DateRange, EMPTY_RANGE, rangeCount } from '../../components/DateRangeFilter';
import { DriverLink, PassengerLink } from '../../components/EntityLinks';
import { TRIP_STATUS } from '../../components/UserTripsSection';
import { csvDateTag, csvDateTime, csvResultMessage, downloadCsv, fetchAllPages } from '../../state/csv';
import './ops.scss';

interface Trip extends TripDetail {
  passengerId: string;
  // Programado: hora del recojo (hora de Perú, sin zona). null = viaje "ahora".
  scheduledAt?: string | null;
  // El conductor del programado no llegó (15 min después de la hora)
  driverLate?: boolean;
}

interface Incident {
  id: string; tripId: string; reportedByUserId: string;
  reportedByRole: string; description: string; createdAt: string;
  reportedByName?: string | null;
}

interface TripsPagedResponse { items: Trip[]; page: number; pageSize: number; total: number; }

interface TripsStatsResponse {
  total: number; pending: number; inProgress: number; completed: number; totalFare: number;
}

const STATUS = TRIP_STATUS;

const PAY: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen' },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen' },
};

const PAGE_SIZE = 25;
const EMPTY_STATS: TripsStatsResponse = { total: 0, pending: 0, inProgress: 0, completed: 0, totalFare: 0 };

/// Filtro rápido: '' = todos, '0' = viajes, '1' = envíos (?serviceType=),
/// 'p' = programados (?scheduled=true).
type ServiceFilter = '' | '0' | '1' | 'p';

/// Agrega el filtro rápido a la URL.
function appendQuick(params: URLSearchParams, f: ServiceFilter) {
  if (f === 'p') params.append('scheduled', 'true');
  else if (f) params.append('serviceType', f);
}

/// Pestaña "Pendientes": viajes que esperan acción (1 = pendiente, 7 = negociando).
const TABS = ['pendientes', 'todos'];

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "sáb 04 oct, 10:30" de una fecha de la API (hora de Perú sin zona), sin depender de la zona del navegador. */
const fmtScheduled = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('es-PE', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

export default function AdminTrips() {
  const toast = useToast();
  const [tab] = useTabParam(TABS);
  const [trips,    setTrips]    = useState<Trip[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [counts,   setCounts]   = useState<Record<string, number>>({});
  const [stats,    setStats]    = useState<TripsStatsResponse>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [loading,  setLoading]  = useState(true);
  const [service,  setService]  = useState<ServiceFilter>('');
  const [status,   setStatus]   = useState('');          // solo en "Todos"
  const [search,   setSearch]   = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [range,    setRange]    = useState<DateRange>(EMPTY_RANGE);
  const [exporting, setExporting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [viewing,  setViewing]  = useState<Trip | null>(null);   // incidencias
  const [detail,   setDetail]   = useState<Trip | null>(null);   // detalle + recorrido

  const statuses = tab === 'pendientes' ? ['1', '7'] : status ? [status] : [];

  // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces la misma lista).
  const filterKey = `${tab}|${service}|${status}|${q}|${range.from}|${range.to}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);
  const statsReq = useRef(0);
  const [statsError, setStatsError] = useState(false);

  async function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      statuses.forEach(s => params.append('status', s));   // ?status=1&status=7
      if (q) params.append('search', q);
      appendQuick(params, service);
      appendRange(params, range);

      const data = await apiFetch<TripsPagedResponse>(`${API.trips}/trips/admin/paged?${params.toString()}`);
      if (id !== reqId.current) return;   // llegó una respuesta más nueva
      setTrips(data.items ?? []);
      setTotal(data.total ?? 0);

      // Incidencias por viaje (solo de los visibles)
      if ((data.items?.length ?? 0) > 0) {
        try {
          const map = await apiFetch<Record<string, number>>(`${API.trips}/trips/incidents/counts`,
            { method: 'POST', body: JSON.stringify(data.items.map(t => t.id)) });
          if (id === reqId.current) setCounts(map ?? {});
        } catch { /* sin conteo */ }
      } else {
        setCounts({});
      }
    } catch (err) {
      if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar los viajes.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  async function loadStats() {
    // KPIs globales (sin pestaña ni paginación): respetan búsqueda y tipo de servicio.
    const id = ++statsReq.current;
    setStatsLoading(true); setStatsError(false);
    try {
      const params = new URLSearchParams();
      if (q) params.append('search', q);
      appendQuick(params, service);
      appendRange(params, range);
      const data = await apiFetch<TripsStatsResponse>(`${API.trips}/trips/admin/stats?${params.toString()}`);
      if (id === statsReq.current) setStats(data ?? EMPTY_STATS);
    } catch {
      if (id === statsReq.current) setStatsError(true);
    } finally { if (id === statsReq.current) setStatsLoading(false); }
  }

  /** CSV de los viajes con los filtros actuales (todas las páginas). */
  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAllPages(async (p, size) => {
        const params = new URLSearchParams({ page: String(p), pageSize: String(size) });
        statuses.forEach(s => params.append('status', s));
        if (q) params.append('search', q);
        appendQuick(params, service);
        appendRange(params, range);
        return apiFetch<TripsPagedResponse>(`${API.trips}/trips/admin/paged?${params.toString()}`);
      });
      downloadCsv(
        ['Fecha', 'Tipo', 'Estado', 'Pasajero', 'Conductor', 'Origen', 'Destino', 'Tarifa (S/)', 'Método de pago',
         'Cupón', 'Descuento (S/)', 'Programado para', 'Inicio', 'Fin', 'Cancelado por', 'Motivo de cancelación', 'Id del viaje'],
        all.items.map(t => [
          csvDateTime(t.createdAt), t.serviceType === 1 ? 'Envío' : 'Viaje', STATUS[t.status]?.label ?? String(t.status),
          t.passengerName ?? '', t.driverId ? (t.driverName ?? '') : 'Sin conductor',
          t.originAddress, t.destAddress, (t.finalFare ?? t.estimatedFare).toFixed(2),
          PAY[t.paymentMethod]?.label ?? t.paymentMethod,
          t.couponCode ?? '', t.discountAmount != null ? t.discountAmount.toFixed(2) : '',
          t.scheduledAt ? fmtScheduled(t.scheduledAt) : '', csvDateTime(t.startedAt), csvDateTime(t.completedAt),
          t.status === 5 ? ({ passenger: 'Pasajero', driver: 'Conductor', admin: 'Bugie', system: 'Sistema' } as Record<string, string>)[t.cancelledBy ?? ''] ?? (t.cancelledBy ?? '') : '',
          t.status === 5 ? (t.cancelReason ?? '') : '', t.id,
        ]),
        `viajes-${csvDateTag()}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'viaje', 'viajes'));
      else toast.success(csvResultMessage(all, 'viaje', 'viajes'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar los viajes.');
    } finally { setExporting(false); }
  }

  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadStats(); }, [q, service, range.from, range.to]);

  // Viajes con incidencias en la página visible (no es un total global).
  const withIncidents = Object.values(counts).filter(c => c > 0).length;

  const columns: Column<Trip>[] = [
    {
      key: 'route', header: 'Recorrido', priority: 1, width: '34%',
      render: t => (
        <div className="d-flex align-items-start gap-2" style={{ minWidth: 0 }}>
          <span className="pt-1"><ServiceIcon serviceType={t.serviceType} /></span>
          <div className="ops-route">
            <div className="stop"><span className="dot" aria-hidden="true" /><span title={t.originAddress}>{t.originAddress}</span></div>
            <div className="stop"><span className="dot end" aria-hidden="true" /><span title={t.destAddress}>{t.destAddress}</span></div>
          </div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Estado', priority: 1,
      render: t => {
        const s = STATUS[t.status] ?? { label: 'Desconocido', tone: 'neutral' as Tone, icon: 'fa-circle' };
        const n = counts[t.id] ?? 0;
        return (
          <div className="d-flex flex-column align-items-start gap-1">
            <div className="d-flex gap-1 flex-wrap">
              <StatusBadge tone={s.tone} icon={s.icon} size="sm">{s.label}</StatusBadge>
              {n > 0 && <StatusBadge tone="warn" icon="fa-triangle-exclamation" size="sm">{n} incidencia{n > 1 ? 's' : ''}</StatusBadge>}
              {t.scheduledAt && <StatusBadge tone="info" icon="fa-calendar-days" size="sm">Programado</StatusBadge>}
              {t.driverLate && <StatusBadge tone="bad" icon="fa-clock" size="sm">Conductor no llegó</StatusBadge>}
            </div>
            {t.status === 5 && t.cancelledBy && (
              <span className="ops-muted d-flex align-items-center gap-1 flex-wrap">
                por <FromBadge from={t.cancelledBy} />{t.cancelReason && <> · {t.cancelReason}</>}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'date', header: 'Fecha', priority: 1,
      render: t => (
        <div className="d-flex flex-column">
          <span className="ops-nowrap">{fmtDate(t.createdAt)}</span>
          {t.scheduledAt && (
            <span className="ops-muted ops-nowrap" title="Hora programada del recojo">
              <i className="fa-solid fa-calendar-days me-1" aria-hidden="true" />Para el {fmtScheduled(t.scheduledAt)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'people', header: 'Pasajero · Conductor', priority: 2,
      render: t => (
        <div className="small" style={{ minWidth: 0 }}>
          <div className="text-truncate"><i className="fa-solid fa-user me-1 bugie-muted" aria-hidden="true" />
            <PassengerLink userId={t.passengerId}>{t.passengerName ?? 'Pasajero'}</PassengerLink></div>
          <div className="text-truncate bugie-muted"><i className="fa-solid fa-id-badge me-1" aria-hidden="true" />
            {t.driverId ? <DriverLink userId={t.driverId}>{t.driverName ?? 'Conductor asignado'}</DriverLink> : 'Sin conductor'}</div>
        </div>
      ),
    },
    {
      key: 'fare', header: 'Tarifa', priority: 1, align: 'right',
      render: t => {
        const pay = PAY[t.paymentMethod] ?? { label: t.paymentMethod, icon: 'fa-credit-card' };
        return (
          <div className="text-end">
            <div className="ops-amount">S/ {(t.finalFare ?? t.estimatedFare).toFixed(2)}</div>
            <div className="ops-muted ops-nowrap"><i className={`fa-solid ${pay.icon} me-1`} aria-hidden="true" />{pay.label}</div>
          </div>
        );
      },
    },
  ];

  const statusActive = (tab === 'todos' && status ? 1 : 0) + rangeCount(range);
  const statValue = (v: number | string) => (statsError ? '—' : v);

  return (
    <Page
      title="Viajes"
      subtitle="Busca, filtra y audita cualquier viaje o envío de la plataforma."
      helpKey="trips"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, loading: exporting, disabled: !total },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: () => { load(); loadStats(); }, loading: loading && trips.length > 0 },
      ]}
    >
      {statsError && (
        <div className="alert alert-warning small d-flex align-items-center gap-2 flex-wrap" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span className="flex-grow-1">No pudimos cargar los totales de viajes.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={loadStats}>Reintentar</button>
        </div>
      )}
      <StatGrid min={150} tourId="trips-stats">
        <StatCard label="Pendientes"  value={statValue(stats.pending)}    icon="fa-clock"         tone="warn"    loading={statsLoading} hint="Esperan conductor" />
        <StatCard label="En curso"    value={statValue(stats.inProgress)} icon="fa-location-dot"  tone="primary" loading={statsLoading} />
        <StatCard label="Completados" value={statValue(stats.completed)}  icon="fa-circle-check"  tone="ok"      loading={statsLoading} />
        <StatCard label="Facturado"   value={statValue(`S/ ${stats.totalFare.toFixed(2)}`)} icon="fa-wallet" tone="info" loading={statsLoading} />
        <StatCard label="Con incidencias" value={withIncidents} icon="fa-triangle-exclamation" tone={withIncidents ? 'warn' : 'neutral'}
                  loading={loading} hint="Solo en la página que estás viendo" />
      </StatGrid>

      <Tabs items={[
        { value: 'pendientes', label: 'Pendientes', icon: 'fa-hourglass-half' },
        { value: 'todos',      label: 'Todos los viajes', icon: 'fa-list' },
      ]} />

      <SectionCard flush tourId="trips-list">
        <div className="p-3" data-tour="trips-filters">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por pasajero, conductor, documento, placa o dirección…"
            chips={[
              { value: '',  label: 'Todos' },
              { value: '0', label: <><i className="fa-solid fa-car me-1" aria-hidden="true" />Viajes</> },
              { value: '1', label: <><i className="fa-solid fa-box me-1" aria-hidden="true" />Envíos</> },
              { value: 'p', label: <><i className="fa-solid fa-calendar-days me-1" aria-hidden="true" />Programados</> },
            ]}
            chip={service}
            onChipChange={v => setService(v as ServiceFilter)}
            activeCount={statusActive}
            onClear={() => { setStatus(''); setRange(EMPTY_RANGE); }}
          >
            {tab === 'todos' && (
              <Select
                size="sm"
                width="auto"
                aria-label="Estado del viaje"
                value={status}
                onChange={setStatus}
                options={[
                  { value: '', label: 'Todos los estados' },
                  ...Object.entries(STATUS).map(([k, s]) => ({ value: k, label: s.label })),
                ]}
              />
            )}
            <DateRangeFilter value={range} onChange={setRange} label="Fecha del viaje" />
          </FilterBar>
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={trips}
          rowKey={t => t.id}
          loading={loading}
          onRowClick={setDetail}
          caption="Lista de viajes"
          mobileSubtitle={t => <>{t.passengerName ?? 'Pasajero'} · {t.driverId ? (t.driverName ?? 'Conductor asignado') : 'Sin conductor'}</>}
          empty={{
            title: service === '1' ? 'Sin envíos' : service === 'p' ? 'Sin programados' : 'Sin viajes',
            text: q ? `No hay resultados para «${q}».` : tab === 'pendientes' ? 'No hay viajes esperando conductor. Todo al día.' : 'No hay viajes en esta categoría.',
            variant: tab === 'pendientes' && !q ? 'done' : 'empty',
          }}
          actions={t => [
            { label: 'Ver detalle y recorrido', icon: 'fa-route', onClick: () => setDetail(t) },
            { label: 'Ver incidencias', icon: 'fa-triangle-exclamation', onClick: () => setViewing(t), hidden: !(counts[t.id] > 0) },
          ]}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </SectionCard>

      <IncidentsDrawer trip={viewing} onClose={() => setViewing(null)} />
      {detail && <TripDetailModal trip={detail} onClose={() => setDetail(null)} />}
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────
/// Incidencias reportadas en un viaje (por pasajero o conductor).
function IncidentsDrawer({ trip, onClose }: { trip: Trip | null; onClose: () => void }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    setLoading(true); setError(null); setIncidents([]);
    apiFetch<Incident[]>(`${API.trips}/trips/incidents/${trip.id}`)
      .then(d => { if (!cancelled) setIncidents(d ?? []); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar las incidencias.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [trip]);

  return (
    <Drawer
      open={!!trip}
      onClose={onClose}
      title="Incidencias del viaje"
      description={trip ? `${trip.originAddress} → ${trip.destAddress}` : undefined}
      size="md"
    >
      {loading ? (
        <div className="ops-stack"><Skeleton height={70} radius={12} count={2} /></div>
      ) : error ? (
        <EmptyState compact variant="error" title="No se pudo cargar" text={error} />
      ) : incidents.length === 0 ? (
        <EmptyState compact variant="done" title="Sin incidencias" text="Nadie reportó problemas en este viaje." />
      ) : (
        <div className="ops-stack">
          {incidents.map(i => (
            <article key={i.id} className="ops-note warn">
              <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
                <StatusBadge tone={i.reportedByRole === 'passenger' ? 'primary' : 'ok'} icon={i.reportedByRole === 'passenger' ? 'fa-user' : 'fa-id-badge'} size="sm">
                  {i.reportedByRole === 'passenger' ? 'Pasajero' : 'Conductor'}{i.reportedByName && <> · {i.reportedByName}</>}
                </StatusBadge>
                <span className="ops-muted">
                  {new Date(i.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="small">{i.description}</div>
            </article>
          ))}
        </div>
      )}
    </Drawer>
  );
}
