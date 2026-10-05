import { useEffect, useRef, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import {
  Column, DataTable, FilterBar, Page, Pagination, SectionCard, Select, StatCard, StatGrid, StatusBadge, Tone,
  useDebouncedValue, useToast,
} from '../../components/ui';
import DateRangeFilter, { appendRange, DateRange, EMPTY_RANGE, rangeCount } from '../../components/DateRangeFilter';
import { DriverLink, PassengerLink } from '../../components/EntityLinks';
import { TripLinkButton, useTripDetail } from '../../components/useTripDetail';
import { csvDateTag, csvDateTime, csvResultMessage, downloadCsv, fetchAllPages } from '../../state/csv';
import './ops.scss';

interface Payment {
  id: string; tripId: string;
  passengerId: string; driverId: string;
  amount: number; platformFee: number; driverAmount: number;
  /** % de comision con el que se cobro este pago (config del sistema). */
  platformFeeRate?: number | null;
  passengerName?: string | null;
  driverName?: string | null;
  method: string; status: string; reference: string | null;
  createdAt: string; paidAt: string | null;
}

interface PaymentsPagedResponse { items: Payment[]; page: number; pageSize: number; total: number; }

interface PaymentsStatsResponse {
  totalAmount: number; totalFee: number; totalDriver: number; pendingCount: number; completedCount: number;
}

const METHOD: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen' },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen' },
};

const STATUS_CFG: Record<string, { label: string; tone: Tone; icon: string }> = {
  pending:   { label: 'Pendiente',   tone: 'warn', icon: 'fa-clock' },
  completed: { label: 'Completado',  tone: 'ok',   icon: 'fa-circle-check' },
  refunded:  { label: 'Reembolsado', tone: 'info', icon: 'fa-rotate-left' },
  failed:    { label: 'Fallido',     tone: 'bad',  icon: 'fa-circle-xmark' },
};

const PAGE_SIZE = 25;
const soles = (n: number | null | undefined) => `S/ ${(n ?? 0).toFixed(2)}`;

export default function Payments() {
  const toast = useToast();
  const trip = useTripDetail();
  const [payments,     setPayments]     = useState<Payment[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [stats,        setStats]        = useState<PaymentsStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError,   setStatsError]   = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error,        setError]        = useState<string | null>(null);
  const [exporting,    setExporting]    = useState(false);
  // Búsqueda, método y fechas se filtran en el backend (en todo el historial).
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [method, setMethod] = useState('');
  const [range,  setRange]  = useState<DateRange>(EMPTY_RANGE);

  // Cambiar un filtro vuelve a la página 1; reqId descarta respuestas viejas.
  const filterKey = `${statusFilter}|${q}|${method}|${range.from}|${range.to}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);
  const statsReq = useRef(0);

  /** Filtros comunes del listado, sus totales y el CSV. */
  function filterParams(withStatus: boolean) {
    const params = new URLSearchParams();
    if (withStatus && statusFilter !== 'all') params.append('status', statusFilter);
    if (q) params.append('search', q);
    if (method) params.append('method', method);
    appendRange(params, range);
    return params;
  }

  async function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const params = filterParams(true);
      params.append('page', String(page));
      params.append('pageSize', String(PAGE_SIZE));
      const data = await apiFetch<PaymentsPagedResponse>(`${API.payments}/payments/paged?${params.toString()}`);
      if (id !== reqId.current) return;
      setPayments(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar los pagos.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  async function loadStats() {
    // Totales: respetan búsqueda, método y fechas (no el chip de estado: los
    // montos siempre suman pagos completados).
    const id = ++statsReq.current;
    setStatsLoading(true); setStatsError(false);
    try {
      const data = await apiFetch<PaymentsStatsResponse>(`${API.payments}/payments/stats?${filterParams(false).toString()}`);
      if (id === statsReq.current) setStats(data);
    } catch {
      if (id === statsReq.current) { setStats(null); setStatsError(true); }
    } finally {
      if (id === statsReq.current) setStatsLoading(false);
    }
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
  useEffect(() => { loadStats(); }, [q, method, range.from, range.to]);

  async function exportCsv() {
    setExporting(true);
    try {
      const base = filterParams(true);
      const all = await fetchAllPages(async (p, size) => {
        const params = new URLSearchParams(base);
        params.append('page', String(p));
        params.append('pageSize', String(size));
        return apiFetch<PaymentsPagedResponse>(`${API.payments}/payments/paged?${params.toString()}`);
      });
      downloadCsv(
        ['Fecha', 'Pagado', 'Pasajero', 'Conductor', 'Monto (S/)', 'Comisión Bugie (S/)', '% comisión', 'Al conductor (S/)', 'Método', 'Estado', 'Referencia', 'Id del viaje'],
        all.items.map(p => [
          csvDateTime(p.createdAt), csvDateTime(p.paidAt),
          p.passengerName ?? '', p.driverName ?? '',
          p.amount.toFixed(2), p.platformFee.toFixed(2), p.platformFeeRate ?? '', p.driverAmount.toFixed(2),
          METHOD[p.method]?.label ?? p.method, STATUS_CFG[p.status]?.label ?? p.status,
          p.reference ?? '', p.tripId,
        ]),
        `pagos-${csvDateTag()}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'pago', 'pagos'));
      else toast.success(csvResultMessage(all, 'pago', 'pagos'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar los pagos.');
    } finally { setExporting(false); }
  }

  const columns: Column<Payment>[] = [
    {
      key: 'who', header: 'Pasajero → Conductor', priority: 1, width: '28%',
      render: p => (
        <div className="small" style={{ minWidth: 0 }}>
          <div className="text-truncate fw-semibold"><i className="fa-solid fa-user me-1 bugie-muted" aria-hidden="true" />
            <PassengerLink userId={p.passengerId}>{p.passengerName ?? 'Pasajero'}</PassengerLink></div>
          <div className="text-truncate bugie-muted"><i className="fa-solid fa-car me-1" aria-hidden="true" />
            <DriverLink userId={p.driverId}>{p.driverName ?? 'Conductor'}</DriverLink></div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Estado', priority: 1,
      render: p => {
        const s = STATUS_CFG[p.status] ?? { label: p.status, tone: 'neutral' as Tone, icon: 'fa-circle' };
        return <StatusBadge tone={s.tone} icon={s.icon} size="sm">{s.label}</StatusBadge>;
      },
    },
    {
      key: 'method', header: 'Método', priority: 2,
      render: p => {
        const m = METHOD[p.method] ?? { label: p.method, icon: 'fa-credit-card' };
        return <span className="ops-nowrap"><i className={`fa-solid ${m.icon} me-1 bugie-muted`} aria-hidden="true" />{m.label}</span>;
      },
    },
    {
      key: 'fee', header: 'Comisión Bugie', priority: 3, align: 'right',
      render: p => (
        <div>
          <div className="ops-amount bad">{soles(p.platformFee)}</div>
          {p.platformFeeRate != null && <div className="ops-muted">{p.platformFeeRate}%</div>}
        </div>
      ),
    },
    { key: 'driverAmount', header: 'Al conductor', priority: 3, align: 'right', render: p => <span className="ops-amount ok">{soles(p.driverAmount)}</span> },
    {
      key: 'date', header: 'Fecha y viaje', priority: 2,
      render: p => (
        <div className="small" style={{ minWidth: 0 }}>
          <div className="ops-nowrap">{new Date(p.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          {p.paidAt && <div className="ops-muted ops-nowrap">Pagado {new Date(p.paidAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div>}
          {p.reference && <div className="ops-muted text-truncate">Ref: {p.reference}</div>}
          <TripLinkButton tripId={p.tripId} opener={trip}>Ver viaje</TripLinkButton>
        </div>
      ),
    },
    { key: 'amount', header: 'Monto', priority: 1, align: 'right', render: p => <span className="ops-amount">{soles(p.amount)}</span> },
  ];

  const extraActive = (method ? 1 : 0) + rangeCount(range);
  const anyFilter = !!q || extraActive > 0;
  const statValue = (v: string | number) => (statsError ? '—' : v);

  return (
    <Page
      title="Pagos"
      subtitle="Conciliación de lo que pagaron los pasajeros y cómo se repartió."
      helpKey="payments"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, loading: exporting, disabled: !total },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: () => { load(); loadStats(); }, loading: loading && payments.length > 0 },
      ]}
    >
      {statsError && (
        <div className="alert alert-warning small d-flex align-items-center gap-2 flex-wrap" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span className="flex-grow-1">No pudimos cargar los totales. La lista de pagos sí está al día.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={loadStats}>Reintentar</button>
        </div>
      )}

      <StatGrid min={160} tourId="payments-stats">
        <StatCard label="Total recaudado" value={statValue(soles(stats?.totalAmount))} icon="fa-wallet"   tone="ok"      loading={statsLoading}
                  hint={anyFilter ? 'Con los filtros aplicados' : 'Pagos completados'} />
        <StatCard label="Comisión Bugie"  value={statValue(soles(stats?.totalFee))}    icon="fa-building" tone="primary" loading={statsLoading} />
        <StatCard label="A conductores"   value={statValue(soles(stats?.totalDriver))} icon="fa-car-side" tone="info"    loading={statsLoading} />
        <StatCard label="Pendientes"      value={statValue(stats?.pendingCount ?? 0)}  icon="fa-clock"    tone={stats?.pendingCount ? 'warn' : 'neutral'} loading={statsLoading} />
      </StatGrid>

      <SectionCard flush tourId="payments-list">
        <div className="p-3" data-tour="payments-filters">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por pasajero, conductor, documento o referencia…"
            chips={[
              { value: 'all',       label: 'Todos' },
              { value: 'pending',   label: 'Pendientes' },
              { value: 'completed', label: 'Completados' },
              { value: 'refunded',  label: 'Reembolsados' },
              { value: 'failed',    label: 'Fallidos' },
            ]}
            chip={statusFilter}
            onChipChange={setStatusFilter}
            activeCount={extraActive}
            onClear={() => { setMethod(''); setRange(EMPTY_RANGE); }}
          >
            <Select
              size="sm"
              width="auto"
              aria-label="Método de pago"
              value={method}
              onChange={setMethod}
              options={[
                { value: '', label: 'Todos los métodos' },
                ...Object.entries(METHOD).map(([k, m]) => ({ value: k, label: m.label })),
              ]}
            />
            <DateRangeFilter value={range} onChange={setRange} label="Fecha del pago" />
          </FilterBar>
        </div>

        {error && <div className="alert alert-warning small mx-3"><i className="fa-solid fa-triangle-exclamation me-2" aria-hidden="true" />{error}</div>}

        <DataTable
          columns={columns}
          rows={payments}
          rowKey={p => p.id}
          loading={loading}
          caption="Lista de pagos"
          mobileSubtitle={p => <>{METHOD[p.method]?.label ?? p.method} · {new Date(p.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</>}
          empty={anyFilter
            ? { title: 'Sin coincidencias', text: 'No hay pagos con estos filtros. Prueba con otra búsqueda o limpia los filtros.' }
            : { title: 'Sin pagos', text: 'No hay transacciones en esta categoría.' }}
          actions={p => [
            { label: 'Ver viaje', icon: 'fa-route', onClick: () => trip.open(p.tripId), hidden: !trip.canOpen },
          ]}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </SectionCard>
      {trip.modal}
    </Page>
  );
}
