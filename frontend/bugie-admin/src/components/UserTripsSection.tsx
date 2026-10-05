import { useEffect, useRef, useState } from 'react';
import { API, ApiError, apiFetch } from '../state/api';
import TripDetailModal, { ServiceIcon, TripDetail } from './TripDetailModal';
import DateRangeFilter, { appendRange, DateRange, EMPTY_RANGE, rangeCount } from './DateRangeFilter';
import { Column, DataTable, FilterBar, Pagination, SectionCard, StatusBadge, Tone } from './ui';
import '../pages/admin/ops.scss';

/// Estados del viaje (TripStatus del backend) con su etiqueta y color.
export const TRIP_STATUS: Record<number, { label: string; tone: Tone; icon: string }> = {
  1: { label: 'Pendiente',  tone: 'warn',    icon: 'fa-clock' },
  2: { label: 'Aceptado',   tone: 'info',    icon: 'fa-car' },
  3: { label: 'En curso',   tone: 'primary', icon: 'fa-location-dot' },
  4: { label: 'Completado', tone: 'ok',      icon: 'fa-circle-check' },
  5: { label: 'Cancelado',  tone: 'neutral', icon: 'fa-circle-xmark' },
  6: { label: 'SOS',        tone: 'bad',     icon: 'fa-triangle-exclamation' },
  7: { label: 'Negociando', tone: 'warn',    icon: 'fa-tag' },
};

interface Paged { items: TripDetail[]; page: number; pageSize: number; total: number; }

const PAGE_SIZE = 10;

const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/// Pestaña "Viajes" de la ficha de un pasajero o de un conductor: lista
/// paginada (estado, fecha, monto) y, al hacer clic, el detalle del viaje.
/// userId = UserId de la persona (en el conductor, su UserId, no el Id del perfil).
export default function UserTripsSection({ mode, userId }: { mode: 'passenger' | 'driver'; userId: string }) {
  const [page,    setPage]    = useState(1);
  const [status,  setStatus]  = useState('');
  const [range,   setRange]   = useState<DateRange>(EMPTY_RANGE);
  const [data,    setData]    = useState<Paged | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [detail,  setDetail]  = useState<TripDetail | null>(null);

  const filterKey = `${userId}|${status}|${range.from}|${range.to}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);

  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status === 'activos') ['1', '2', '3', '6', '7'].forEach(s => params.append('status', s));
    else if (status) params.append('status', status);
    appendRange(params, range);
    const path = mode === 'passenger' ? 'by-passenger' : 'by-driver';
    apiFetch<Paged>(`${API.trips}/trips/admin/${path}/${userId}?${params}`)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(err => { if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los viajes.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  const columns: Column<TripDetail>[] = [
    {
      key: 'route', header: 'Recorrido', priority: 1, width: '42%',
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
        const s = TRIP_STATUS[t.status] ?? { label: 'Desconocido', tone: 'neutral' as Tone, icon: 'fa-circle' };
        return <StatusBadge tone={s.tone} icon={s.icon} size="sm">{s.label}</StatusBadge>;
      },
    },
    {
      key: 'other', header: mode === 'passenger' ? 'Conductor' : 'Pasajero', priority: 3,
      render: t => <span className="small text-truncate d-block">{mode === 'passenger'
        ? (t.driverId ? (t.driverName ?? 'Conductor asignado') : 'Sin conductor')
        : (t.passengerName ?? 'Pasajero')}</span>,
    },
    { key: 'date', header: 'Fecha', priority: 2, render: t => <span className="ops-nowrap small">{fmtDate(t.createdAt)}</span> },
    {
      key: 'fare', header: 'Monto', priority: 1, align: 'right',
      render: t => <span className="ops-amount">S/ {(t.finalFare ?? t.estimatedFare).toFixed(2)}</span>,
    },
  ];

  const activeCount = (status ? 1 : 0) + rangeCount(range);

  return (
    <SectionCard flush title="Viajes" icon="fa-route"
                 description={mode === 'passenger' ? 'Viajes y envíos que pidió este pasajero.' : 'Viajes y envíos que tomó este conductor.'}>
      <div className="p-3">
        <FilterBar
          chips={[
            { value: '',        label: 'Todos' },
            { value: 'activos', label: 'Activos' },
            { value: '4',       label: 'Completados' },
            { value: '5',       label: 'Cancelados' },
          ]}
          chip={status}
          onChipChange={setStatus}
          activeCount={activeCount}
          onClear={() => { setStatus(''); setRange(EMPTY_RANGE); }}
        >
          <DateRangeFilter value={range} onChange={setRange} label="Fecha del viaje" />
        </FilterBar>
      </div>
      {error && <div className="alert alert-danger small mx-3">{error}</div>}
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={t => t.id}
        loading={loading}
        onRowClick={setDetail}
        caption="Viajes de la persona"
        mobileSubtitle={t => <>{TRIP_STATUS[t.status]?.label ?? ''} · {fmtDate(t.createdAt)}</>}
        empty={activeCount
          ? { title: 'Sin viajes con estos filtros', text: 'Prueba con otro estado o rango de fechas.' }
          : { title: 'Aún no tiene viajes', text: mode === 'passenger' ? 'Cuando pida un viaje aparecerá aquí.' : 'Cuando tome un viaje aparecerá aquí.' }}
        actions={t => [{ label: 'Ver detalle y recorrido', icon: 'fa-route', onClick: () => setDetail(t) }]}
      />
      <div className="px-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </div>
      {detail && <TripDetailModal trip={detail} onClose={() => setDetail(null)} />}
    </SectionCard>
  );
}
