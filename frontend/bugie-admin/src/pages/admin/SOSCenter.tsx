import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BugieMap from '../../components/BugieMapAdmin';
import EmergencyContactCard from '../../components/EmergencyContactCard';
import DateRangeFilter, { appendRange, DateRange, EMPTY_RANGE, rangeCount } from '../../components/DateRangeFilter';
import { DriverLink, PassengerLink } from '../../components/EntityLinks';
import { TripLinkButton, useTripDetail } from '../../components/useTripDetail';
import { apiFetch, API, ApiError } from '../../state/api';
import { useMonitorHub } from '../../hooks/useMonitorHub';
import {
  Column, DataTable, Drawer, EmptyState, FilterBar, Page, Pagination, SectionCard, Skeleton, StatusBadge, Tabs,
  useDebouncedValue, useMediaQuery, useTabParam,
} from '../../components/ui';
import { useResolveSos } from './livemap/sosActions';
import { fmtDateTime, minutesAgo, roleLabel } from './livemap/types';
import './ops.scss';

/// Alerta SOS con las personas del viaje (GET /api/sos/admin/active y /history).
interface SosAlert {
  id: string; tripId: string; userId: string;
  userRole: string; lat: number; lng: number;
  resolved: boolean; createdAt: string;
  resolvedAt?: string | null; resolutionReason?: string | null;
  resolvedByName?: string | null; durationMinutes?: number | null;
  userName?: string | null; userPhone?: string | null;
  passengerId: string; passengerName?: string | null; passengerPhone?: string | null;
  driverId?: string | null; driverName?: string | null; driverPhone?: string | null;
  originAddress?: string | null; destAddress?: string | null;
}

interface HistoryPage { items: SosAlert[]; page: number; pageSize: number; total: number; }

const REFRESH_MS = 15000;
const HISTORY_PAGE_SIZE = 20;

/** Minutos desde que se reportó la alerta. */
const ageMin = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

/** "8 min", "1 h 05 min". */
function fmtDuration(min?: number | null) {
  if (min == null) return '—';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Quién activó la alerta y el otro participante del viaje. */
function people(a: SosAlert) {
  const isPassenger = a.userRole === 'passenger';
  const passenger = { role: 'passenger', id: a.passengerId, name: a.passengerName, phone: a.passengerPhone };
  const driver = { role: 'driver', id: a.driverId ?? null, name: a.driverName, phone: a.driverPhone };
  return isPassenger ? { who: passenger, other: driver } : { who: driver, other: passenger };
}

/** Nombre con enlace a su ficha (pasajero o conductor). */
function PersonName({ role, id, name, onNavigate }: { role: string; id: string | null; name?: string | null; onNavigate?: () => void }) {
  const text = name || (role === 'passenger' ? 'Pasajero' : 'Conductor');
  if (!id) return <span>{text}</span>;
  return role === 'passenger'
    ? <PassengerLink userId={id} onNavigate={onNavigate}>{text}</PassengerLink>
    : <DriverLink userId={id} onNavigate={onNavigate}>{text}</DriverLink>;
}

function Phone({ phone }: { phone?: string | null }) {
  if (!phone) return <span className="bugie-muted">Sin celular</span>;
  return (
    <a className="fw-semibold text-decoration-none ops-nowrap" href={`tel:${phone}`} onClick={e => e.stopPropagation()}>
      <i className="fa-solid fa-phone me-1" aria-hidden="true" />{phone}
    </a>
  );
}

/// Detalle de una alerta: personas, mapa, contacto de emergencia y botón para desactivarla.
function SosDetail({ alert, onResolve, trip }: {
  alert: SosAlert; onResolve: (a: SosAlert) => void; trip: ReturnType<typeof useTripDetail>;
}) {
  const { who, other } = people(alert);
  return (
    <div className="d-grid gap-3">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <StatusBadge tone={alert.resolved ? 'ok' : 'bad'} icon={alert.resolved ? 'fa-check' : 'fa-bell'}>
          {alert.resolved ? 'Resuelta' : 'SOS activo'}
        </StatusBadge>
        <span className="fw-bold">{roleLabel(alert.userRole)} en emergencia</span>
      </div>

      <dl className="bx-row-card-fields mb-0">
        <div>
          <dt>Activó ({roleLabel(who.role)})</dt>
          <dd className="d-grid"><PersonName {...who} /><Phone phone={who.phone} /></dd>
        </div>
        <div>
          <dt>{roleLabel(other.role)} del viaje</dt>
          <dd className="d-grid">
            {other.id ? <><PersonName {...other} /><Phone phone={other.phone} /></> : <span className="bugie-muted">Sin conductor asignado</span>}
          </dd>
        </div>
        <div><dt>Reportada</dt><dd>{fmtDateTime(alert.createdAt)} ({minutesAgo(alert.createdAt)})</dd></div>
        <div><dt>Viaje</dt><dd><TripLinkButton tripId={alert.tripId} opener={trip}>Ver viaje</TripLinkButton></dd></div>
      </dl>

      <div className="ops-detail-map">
        <BugieMap
          height="100%"
          center={{ lat: alert.lat, lng: alert.lng }}
          zoom={15}
          markers={[{ lat: alert.lat, lng: alert.lng, label: 'Alerta SOS', type: 'destination' as const }]}
        />
      </div>
      <div className="small bugie-muted">Coordenadas: {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)}</div>
      {/* Contacto de emergencia de quien activó el SOS (para llamarlo). */}
      <div className="ops-note">
        <EmergencyContactCard userId={alert.userId} compact />
      </div>
      {!alert.resolved && (
        <button type="button" className="btn btn-danger" onClick={() => onResolve(alert)}>
          <i className="fa-solid fa-circle-check me-2" aria-hidden="true" />Desactivar alerta
        </button>
      )}
    </div>
  );
}

/// Centro SOS: bandeja de alertas activas e historial de las resueltas.
export default function SOSCenter() {
  const [tab] = useTabParam(['activas', 'historial']);
  const trip = useTripDetail();

  return (
    <Page
      title="Centro SOS"
      subtitle="Atiende las emergencias: ubica a la persona, llama a su contacto y desactiva la alerta."
      helpKey="sos"
    >
      <div data-tour="sos-tabs">
        <Tabs items={[
          { value: 'activas',   label: 'Activas',   icon: 'fa-bell' },
          { value: 'historial', label: 'Historial', icon: 'fa-clock-rotate-left' },
        ]} />
      </div>
      {tab === 'activas' ? <ActiveAlerts trip={trip} /> : <AlertHistory trip={trip} />}
      {trip.modal}
    </Page>
  );
}

// ── Activas ───────────────────────────────────────────────────
function ActiveAlerts({ trip }: { trip: ReturnType<typeof useTripDetail> }) {
  const isDesktop = useMediaQuery('(min-width: 992px)');
  const resolveSos = useResolveSos();

  const [alerts,     setAlerts]     = useState<SosAlert[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  // Se guarda el id (no el objeto) para que el poll no pise la selección.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Meta de respuesta (Configuración → sos_response_min). Null si no se pudo leer.
  const [targetMin,  setTargetMin]  = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ settingKey: string; value: string }[]>(`${API.landing}/landing/settings`)
      .then(list => {
        const v = Number(list.find(s => s.settingKey === 'sos_response_min')?.value);
        setTargetMin(Number.isFinite(v) && v > 0 ? v : null);
      })
      .catch(() => setTargetMin(null));
  }, []);

  const load = useCallback(() => {
    setRefreshing(true);
    apiFetch<SosAlert[]>(`${API.trips}/sos/admin/active`)
      .then(data => { setAlerts(data ?? []); setError(null); })
      .catch(err => setError(err instanceof ApiError ? err.message : 'No pudimos cargar las alertas. Vuelve a intentarlo en un momento.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // SOS nuevo por SignalR: refrescar al instante.
  useMonitorHub({ onSos: load });

  // La más reciente arriba.
  const sorted = useMemo(() => [...alerts].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [alerts]);
  const activeCount = alerts.length;

  // En escritorio siempre hay una seleccionada (la primera si no eligió ninguna).
  const selected = sorted.find(a => a.id === selectedId) ?? (isDesktop ? sorted[0] ?? null : null);

  function select(a: SosAlert) {
    setSelectedId(a.id);
    if (!isDesktop) setDrawerOpen(true);
  }

  async function handleResolve(a: SosAlert) {
    if (!(await resolveSos(a))) return;
    // Sacar de la lista sin esperar al próximo poll.
    setAlerts(prev => prev.filter(x => x.id !== a.id));
    if (selectedId === a.id) { setSelectedId(null); setDrawerOpen(false); }
  }

  return (
    <>
      {error && (
        <div className="alert alert-warning small mb-0 d-flex align-items-center gap-2 flex-wrap" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span className="flex-grow-1">{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load}>Reintentar</button>
        </div>
      )}

      <div className="sos-layout">
        <SectionCard
          title="Bandeja de alertas"
          icon="fa-bell"
          description={targetMin ? `Se actualiza cada 15 s. Meta de respuesta: ${targetMin} min.` : 'Se actualiza cada 15 s.'}
          actions={
            <span className="d-inline-flex align-items-center gap-2">
              {!loading && <StatusBadge tone={activeCount ? 'bad' : 'ok'}>{activeCount} activa{activeCount !== 1 ? 's' : ''}</StatusBadge>}
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={refreshing} aria-label="Actualizar alertas">
                <i className={`fa-solid fa-rotate ${refreshing ? 'fa-spin' : ''}`} aria-hidden="true" />
              </button>
            </span>
          }
          flush
          tourId="sos-inbox"
        >
          {loading ? (
            <div className="p-3 d-grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={56} radius={10} />)}</div>
          ) : error && sorted.length === 0 ? (
            <EmptyState variant="error" title="No se pudo cargar" text="Revisa tu conexión y vuelve a intentarlo." />
          ) : sorted.length === 0 ? (
            <EmptyState variant="done" title="Sin alertas activas" text="Todo tranquilo. La bandeja se actualiza sola." />
          ) : (
            <ul className="lm-list">
              {sorted.map(a => {
                const { who } = people(a);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`lm-item ${selected?.id === a.id ? 'is-selected' : ''} lm-flash-bad`}
                      onClick={() => select(a)}
                      aria-pressed={selected?.id === a.id}
                    >
                      <span className="lm-avatar bx-tone-bad" aria-hidden="true">
                        <i className={`fa-solid ${a.userRole === 'passenger' ? 'fa-person' : 'fa-id-card'}`} />
                      </span>
                      <span className="main">
                        <span className="name d-block text-truncate">{who.name || roleLabel(a.userRole)} · {roleLabel(a.userRole)}</span>
                        <span className="sub d-block text-truncate">
                          {who.phone && <><i className="fa-solid fa-phone me-1" aria-hidden="true" />{who.phone} · </>}
                          <i className="fa-regular fa-clock me-1" aria-hidden="true" />{minutesAgo(a.createdAt)}
                        </span>
                      </span>
                      <StatusBadge tone="bad" size="sm">
                        {targetMin && ageMin(a.createdAt) > targetMin ? 'Fuera de meta' : 'Urgente'}
                      </StatusBadge>
                      <span className="end" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {isDesktop && (
          <SectionCard title={selected ? 'Detalle de la alerta' : 'Selecciona una alerta'} icon="fa-location-dot" tourId="sos-detail">
            {selected
              ? <SosDetail alert={selected} onResolve={handleResolve} trip={trip} />
              : <EmptyState compact icon="fa-hand-pointer" title="Nada seleccionado" text="Elige una alerta de la bandeja para ver dónde está y a quién llamar." />}
          </SectionCard>
        )}
      </div>

      {!isDesktop && (
        <Drawer open={drawerOpen && !!selected} onClose={() => setDrawerOpen(false)} title="Detalle de la alerta" size="md">
          {selected && <SosDetail alert={selected} onResolve={handleResolve} trip={trip} />}
        </Drawer>
      )}
    </>
  );
}

// ── Historial (resueltas) ─────────────────────────────────────
function AlertHistory({ trip }: { trip: ReturnType<typeof useTripDetail> }) {
  const [page,    setPage]    = useState(1);
  const [range,   setRange]   = useState<DateRange>(EMPTY_RANGE);
  const [search,  setSearch]  = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [data,    setData]    = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const filterKey = `${q}|${range.from}|${range.to}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);

  function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(HISTORY_PAGE_SIZE) });
    if (q) params.append('search', q);
    appendRange(params, range);
    apiFetch<HistoryPage>(`${API.trips}/sos/admin/history?${params}`)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(err => { if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }

  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  const columns: Column<SosAlert>[] = [
    {
      key: 'date', header: 'Activada', priority: 1,
      render: a => <span className="small ops-nowrap">{fmtDateTime(a.createdAt)}</span>,
    },
    {
      key: 'who', header: 'Quién activó', priority: 1, width: '22%',
      render: a => {
        const { who } = people(a);
        return (
          <div className="small d-grid" style={{ minWidth: 0 }}>
            <span className="text-truncate"><PersonName {...who} /> <span className="bugie-muted">· {roleLabel(a.userRole)}</span></span>
            {who.phone && <span className="bugie-muted">{who.phone}</span>}
          </div>
        );
      },
    },
    {
      key: 'other', header: 'Otro participante', priority: 3,
      render: a => {
        const { other } = people(a);
        return other.id
          ? <span className="small text-truncate d-block"><PersonName {...other} /> <span className="bugie-muted">· {roleLabel(other.role)}</span></span>
          : <span className="small bugie-muted">Sin conductor</span>;
      },
    },
    {
      key: 'resolved', header: 'Resuelta por', priority: 2,
      render: a => (
        <div className="small d-grid" style={{ minWidth: 0 }}>
          <span className="text-truncate">{a.resolvedByName ?? 'Administrador'}</span>
          {a.resolvedAt && <span className="bugie-muted ops-nowrap">{fmtDateTime(a.resolvedAt)}</span>}
        </div>
      ),
    },
    {
      key: 'reason', header: 'Motivo', priority: 2, width: '24%',
      render: a => <span className="small" title={a.resolutionReason ?? undefined}>{a.resolutionReason || '—'}</span>,
    },
    {
      key: 'duration', header: 'Duración', priority: 1, align: 'right',
      render: a => <span className="ops-nowrap fw-semibold">{fmtDuration(a.durationMinutes)}</span>,
    },
  ];

  const activeCount = rangeCount(range) + (q ? 1 : 0);

  return (
    <SectionCard flush tourId="sos-history">
      <div className="p-3" data-tour="sos-history-filters">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre, celular o motivo…"
          activeCount={activeCount}
          onClear={() => { setRange(EMPTY_RANGE); setSearch(''); }}
        >
          <DateRangeFilter value={range} onChange={setRange} label="Fecha de la alerta" />
        </FilterBar>
      </div>
      {error && (
        <div className="alert alert-warning small mx-3 d-flex align-items-center gap-2 flex-wrap" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span className="flex-grow-1">{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load}>Reintentar</button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={a => a.id}
        loading={loading}
        caption="Historial de alertas SOS resueltas"
        mobileTitle={a => <>{people(a).who.name || roleLabel(a.userRole)} · {roleLabel(a.userRole)}</>}
        mobileSubtitle={a => <>{fmtDateTime(a.createdAt)} · {fmtDuration(a.durationMinutes)}</>}
        onRowClick={trip.canOpen ? a => trip.open(a.tripId) : undefined}
        actions={a => [{ label: 'Ver detalle del viaje', icon: 'fa-route', onClick: () => trip.open(a.tripId), hidden: !trip.canOpen }]}
        empty={activeCount
          ? { title: 'Sin alertas con estos filtros', text: 'Prueba con otro rango de fechas o búsqueda.' }
          : { title: 'Aún no hay alertas resueltas', text: 'Cuando desactives una alerta quedará registrada aquí con su motivo.' }}
      />
      <div className="px-3">
        <Pagination page={page} pageSize={HISTORY_PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </div>
    </SectionCard>
  );
}
