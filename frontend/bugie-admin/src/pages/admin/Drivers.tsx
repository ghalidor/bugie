import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, API, ApiError } from '../../state/api';
import {
  Column, DataTable, FilterBar, Page, Pagination, SectionCard, StatusBadge, Tone, useDebouncedValue, useTabParam, useToast,
} from '../../components/ui';
import { csvDateTag, csvDateTime, csvResultMessage, downloadCsv, fetchAllPages } from '../../state/csv';
import { DriverStatusBadge, PersonCell, StarRating, driverDocMeta, fmtDate } from './people/PeopleShared';
import { DeletedBadge } from './people/AccountShared';

interface Driver {
  id: string; userId: string; fullName?: string;
  deletedAt?: string | null; deletedReason?: string | null;
  status: number; isOnline: boolean;
  rating: number; totalRatings: number;
  createdAt: string; approvedAt: string | null;
  suspendedUntil?: string | null;
  openReviewRequest?: { id: string; message: string; createdAt: string } | null;
  /** Placa del vehículo activo. */
  activePlate?: string | null;
}

/** Estado del conductor en texto (para el CSV). */
const DRIVER_STATUS_TEXT: Record<number, string> = {
  1: 'Faltan documentos', 2: 'En revisión', 3: 'Aprobado', 4: 'Suspendido', 5: 'Rechazado', 6: 'Documentos vencidos',
};

interface ExpiringDriver {
  driverId: string;
  userId:   string;
  fullName: string;
  email:    string;
  phone:    string;
  documents: Array<{
    documentId: string;
    docType:    string;
    expiresAt:  string;
    daysUntilExpiry: number;
  }>;
}

interface ExpiringResponse {
  thresholdDays: number;
  drivers: ExpiringDriver[];
}

interface DriversPagedResponse {
  items: Driver[];
  page: number;
  pageSize: number;
  total: number;
}

interface DriversStatsResponse {
  total: number;
  online: number;
  pendingDocs: number;
  underReview: number;
  approved: number;
  expired: number;
  suspended?: number;
  rejected?: number;
  openReviewRequests?: number;
}

const EMPTY_STATS: DriversStatsResponse = { total: 0, online: 0, pendingDocs: 0, underReview: 0, approved: 0, expired: 0, suspended: 0, rejected: 0, openReviewRequests: 0 };

// El primero es el filtro por defecto: Todos, para no abrir en una lista vacía.
const FILTERS = ['all', 'pending_docs', 'under_review', 'expired', 'expiring_soon', 'online', 'approved', 'suspended', 'rejected', 'open_review', 'deleted'] as const;
type FilterKey = typeof FILTERS[number];

/// Cada filtro → parámetros del backend. "Por vencer" usa otro endpoint (lista corta, sin paginar).
/// "Eliminadas" = deleted=true (por defecto el backend no devuelve cuentas eliminadas).
function filterToParams(f: FilterKey): { status?: number; online?: boolean; openReview?: boolean; deleted?: boolean } {
  switch (f) {
    case 'deleted':      return { deleted: true };
    case 'pending_docs': return { status: 1 };
    case 'under_review': return { status: 2 };
    case 'approved':     return { status: 3 };
    case 'expired':      return { status: 6 };
    case 'suspended':    return { status: 4 };
    case 'rejected':     return { status: 5 };
    case 'open_review':  return { openReview: true };
    case 'online':       return { online: true };
    default:             return {};
  }
}

const driverName = (d: Driver) => d.fullName || `Conductor ${d.userId.slice(0, 8)}…`;

export default function Drivers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [filterRaw, setFilter] = useTabParam([...FILTERS], 'filtro');
  const filter = filterRaw as FilterKey;
  const [drivers,       setDrivers]       = useState<Driver[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [pageSize,      setPageSize]      = useState(25);
  const [expiringSoon,  setExpiringSoon]  = useState<ExpiringDriver[]>([]);
  const [thresholdDays, setThresholdDays] = useState(15);
  const [search,        setSearch]        = useState('');
  const searchDebounced = useDebouncedValue(search, 300);
  const [stats,   setStats]   = useState<DriversStatsResponse>(EMPTY_STATS);
  const [deletedCount, setDeletedCount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces); reqId descarta respuestas viejas.
  const filterKey = `${filter}|${searchDebounced.trim()}|${pageSize}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);
  const statsReq = useRef(0);
  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);
  // Contadores globales: solo respetan la búsqueda (no el filtro), así cada chip muestra su total.
  useEffect(() => { loadStats(); /* eslint-disable-next-line */ }, [searchDebounced]);

  /** Filtro y búsqueda actuales como parámetros (listado y CSV). */
  function listParams() {
    const p = filterToParams(filter);
    const params = new URLSearchParams();
    if (p.status !== undefined) params.append('status', String(p.status));
    if (p.online !== undefined) params.append('online', String(p.online));
    if (p.openReview !== undefined) params.append('openReview', String(p.openReview));
    if (p.deleted !== undefined) params.append('deleted', String(p.deleted));
    if (searchDebounced.trim()) params.append('search', searchDebounced.trim());
    return params;
  }

  async function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      if (filter === 'expiring_soon') {
        const data = await apiFetch<ExpiringResponse>(`${API.drivers}/drivers/expiring-soon`);
        if (id !== reqId.current) return;
        const items = data.drivers ?? [];
        const q = searchDebounced.trim().toLowerCase();
        // Filtrado en cliente (lista típicamente pequeña).
        setExpiringSoon(!q ? items : items.filter(d =>
          d.fullName.toLowerCase().includes(q) || d.email.toLowerCase().includes(q)));
        setThresholdDays(data.thresholdDays ?? 15);
        setDrivers([]); setTotal(0);
      } else {
        const params = listParams();
        params.append('page', String(page));
        params.append('pageSize', String(pageSize));
        const data = await apiFetch<DriversPagedResponse>(`${API.drivers}/drivers/paged?${params.toString()}`);
        if (id !== reqId.current) return;
        setDrivers(data.items ?? []);
        setTotal(data.total ?? 0);
        setExpiringSoon([]);
      }
    } catch (err) {
      if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar los conductores.');
    } finally { if (id === reqId.current) setLoading(false); }
  }

  /** CSV de los conductores del filtro actual (todas las páginas). */
  async function exportCsv() {
    setExporting(true);
    try {
      const base = listParams();
      const all = await fetchAllPages(async (p, size) => {
        const params = new URLSearchParams(base);
        params.append('page', String(p));
        params.append('pageSize', String(size));
        return apiFetch<DriversPagedResponse>(`${API.drivers}/drivers/paged?${params.toString()}`);
      });
      downloadCsv(
        ['Conductor', 'Estado', 'Placa', 'En línea', 'Calificación', 'N° de calificaciones', 'Registro', 'Aprobado', 'Cuenta eliminada', 'Id del conductor'],
        all.items.map(d => [
          driverName(d), d.deletedAt ? 'Eliminada' : DRIVER_STATUS_TEXT[d.status] ?? String(d.status), d.activePlate ?? '',
          d.isOnline ? 'Sí' : 'No', (d.rating ?? 0).toFixed(2), d.totalRatings ?? 0,
          csvDateTime(d.createdAt), csvDateTime(d.approvedAt), csvDateTime(d.deletedAt), d.id,
        ]),
        `conductores-${csvDateTag()}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'conductor', 'conductores'));
      else toast.success(csvResultMessage(all, 'conductor', 'conductores'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar los conductores.');
    } finally { setExporting(false); }
  }

  async function loadStats() {
    const id = ++statsReq.current;
    try {
      const params = new URLSearchParams();
      if (searchDebounced.trim()) params.append('search', searchDebounced.trim());
      const deletedParams = new URLSearchParams(params);
      deletedParams.append('deleted', 'true');
      const [data, deletedData] = await Promise.all([
        apiFetch<DriversStatsResponse>(`${API.drivers}/drivers/stats?${params.toString()}`),
        apiFetch<DriversStatsResponse>(`${API.drivers}/drivers/stats?${deletedParams.toString()}`).catch(() => null),
      ]);
      if (id !== statsReq.current) return;
      setStats(data ?? EMPTY_STATS);
      setDeletedCount(deletedData?.total);
    } catch { /* los contadores no son críticos */ }
  }

  const columns: Column<Driver>[] = [
    { key: 'name', header: 'Conductor', priority: 1, width: '32%',
      render: d => <PersonCell name={driverName(d)} sub={d.isOnline ? 'En línea ahora' : undefined} tone={d.isOnline ? 'ok' : 'primary'} muted={!!d.deletedAt} /> },
    { key: 'status', header: 'Estado', priority: 1,
      render: d => d.deletedAt ? <DeletedBadge deletedAt={d.deletedAt} deletedReason={d.deletedReason} /> : (
        <span className="d-inline-flex flex-wrap gap-1">
          <DriverStatusBadge status={d.status} suspendedUntil={d.suspendedUntil ?? null} />
          {d.openReviewRequest && <StatusBadge tone="warn" icon="fa-envelope-open-text" size="sm">Revisión pendiente</StatusBadge>}
        </span>
      ) },
    { key: 'plate', header: 'Placa', priority: 2,
      render: d => d.activePlate ? <span className="lm-plate ops-nowrap">{d.activePlate}</span> : <span className="bugie-muted">—</span> },
    { key: 'online', header: 'Conexión', priority: 2,
      render: d => <StatusBadge tone={d.isOnline ? 'ok' : 'neutral'} dot>{d.isOnline ? 'En línea' : 'Desconectado'}</StatusBadge> },
    { key: 'rating', header: 'Calificación', priority: 2, render: d => <StarRating rating={d.rating ?? 0} total={d.totalRatings ?? 0} /> },
    { key: 'createdAt', header: 'Registro', priority: 1, mobileLabel: 'Registro', render: d => fmtDate(d.createdAt) },
  ];

  const chips = [
    { value: 'all',           label: 'Todos',             count: stats.total },
    { value: 'pending_docs',  label: 'Faltan documentos', count: stats.pendingDocs },
    { value: 'under_review',  label: 'En revisión',       count: stats.underReview },
    { value: 'expired',       label: 'Docs vencidos',     count: stats.expired },
    { value: 'expiring_soon', label: 'Por vencer' },
    { value: 'online',        label: 'En línea',          count: stats.online },
    { value: 'approved',      label: 'Aprobados',         count: stats.approved },
    { value: 'suspended',     label: 'Suspendidos',       count: stats.suspended },
    { value: 'rejected',      label: 'Rechazados',        count: stats.rejected },
    { value: 'open_review',   label: 'Con solicitud de revisión', count: stats.openReviewRequests },
    { value: 'deleted',       label: 'Eliminadas',        count: deletedCount },
  ];

  return (
    <Page
      title="Conductores"
      subtitle="Consulta a los conductores por estado y abre su ficha para revisarlos."
      icon="fa-car"
      helpKey="drivers"
      actions={[
        { label: 'Bandeja de verificación', icon: 'fa-id-card', to: '/admin/verificacion' },
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, loading: exporting,
          disabled: filter === 'expiring_soon' || !total },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: () => { load(); loadStats(); }, loading },
      ]}
    >
      <SectionCard flush tourId="drivers-list">
        <div className="p-3" data-tour="drivers-filters">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nombre, correo, teléfono, documento o placa"
            chips={chips}
            chip={filter}
            onChipChange={setFilter}
          />
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        {filter === 'expiring_soon' ? (
          <ExpiringTable drivers={expiringSoon} loading={loading} thresholdDays={thresholdDays}
                         onOpen={id => navigate(`/admin/conductores/${id}`)} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={drivers}
              rowKey={d => d.id}
              loading={loading}
              onRowClick={d => navigate(`/admin/conductores/${d.id}`)}
              actions={d => [{ label: 'Ver ficha', icon: 'fa-eye', to: `/admin/conductores/${d.id}` }]}
              empty={filter === 'deleted' && !searchDebounced
                ? { title: 'Sin cuentas eliminadas', text: 'Ningún conductor ha eliminado su cuenta.', icon: 'fa-user-xmark' }
                : { title: 'Sin conductores', icon: 'fa-car-side',
                    text: searchDebounced ? `No hay resultados para «${searchDebounced}».` : 'No hay conductores en esta categoría.' }}
            />
            <div className="px-3">
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </div>
          </>
        )}
      </SectionCard>
    </Page>
  );
}

/// Tono según los días que faltan para que venza el documento.
function expiryTone(days: number): Tone {
  if (days <= 0) return 'bad';
  if (days <= 6) return 'warn';
  return 'info';
}
function expiryText(days: number): string {
  if (days < 0) return `venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'vence hoy';
  return `vence en ${days} día${days === 1 ? '' : 's'}`;
}

function ExpiringTable({ drivers, loading, thresholdDays, onOpen }: {
  drivers: ExpiringDriver[]; loading: boolean; thresholdDays: number; onOpen: (driverId: string) => void;
}) {
  const columns: Column<ExpiringDriver>[] = [
    { key: 'name', header: 'Conductor', priority: 1, width: '30%',
      render: d => <PersonCell name={d.fullName} sub={d.email} tone="warn" /> },
    { key: 'docs', header: 'Documentos', priority: 1,
      render: d => (
        <span className="d-inline-flex flex-wrap gap-1">
          {d.documents.map(doc => (
            <StatusBadge key={doc.documentId} tone={expiryTone(doc.daysUntilExpiry)} icon="fa-calendar-day" size="sm">
              {driverDocMeta(doc.docType).label}: {expiryText(doc.daysUntilExpiry)}
            </StatusBadge>
          ))}
        </span>
      ) },
    { key: 'phone', header: 'Teléfono', priority: 2, render: d => d.phone ? <a href={`tel:${d.phone}`} onClick={e => e.stopPropagation()}>{d.phone}</a> : '—' },
  ];
  return (
    <>
      {!loading && drivers.length > 0 && (
        <div className="alert alert-warning small mx-3 d-flex align-items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>Conductores con documentos que vencen en los próximos <strong>{thresholdDays} días</strong> (o ya vencidos). Avísales para que los renueven.</span>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={drivers}
        rowKey={d => d.driverId}
        loading={loading}
        onRowClick={d => onOpen(d.driverId)}
        actions={d => [{ label: 'Ver ficha', icon: 'fa-eye', onClick: () => onOpen(d.driverId) }]}
        empty={{ variant: 'done', title: 'Nada por vencer', text: `No hay documentos que venzan en los próximos ${thresholdDays} días.` }}
      />
    </>
  );
}
