import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, API, ApiError } from '../../state/api';
import {
  Column, DataTable, FilterBar, Page, Pagination, SectionCard, StatusBadge, Tone, useDebouncedValue,
} from '../../components/ui';
import { DriverStatusBadge, PersonCell, fileUrl, fmtDate } from './people/PeopleShared';

/// Bandeja de verificación: conductores PENDIENTES de revisión (status 1, 2 ó 6:
/// faltan documentos, en revisión, documentos vencidos). La aprobación real se
/// hace en la ficha /admin/conductores/{id}.
/// Paginación en el servidor: GET /api/drivers/pending/paged?page=&pageSize=&search=

interface PendingDriver {
  id: string;
  userId: string;
  fullName: string;
  status: number;       // 1=PendingDocs, 2=UnderReview, 6=ExpiredDocs
  rating: number;
  totalRatings: number;
  createdAt: string;
  profilePhotoUrl: string | null;
}

interface PendingPagedResponse {
  items: PendingDriver[];
  page: number;
  pageSize: number;
  total: number;
}

/// Qué tiene que hacer el admin (o el conductor) según el estado.
const NEXT_STEP: Record<number, { text: string; who: 'admin' | 'conductor' }> = {
  1: { text: 'Esperando que suba sus documentos obligatorios.', who: 'conductor' },
  2: { text: 'Documentos subidos: revísalos y aprueba o rechaza.', who: 'admin' },
  6: { text: 'Tiene documentos vencidos: revisa los nuevos o pídele que los renueve.', who: 'admin' },
};

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
function waitTone(days: number): Tone {
  if (days >= 7) return 'bad';
  if (days >= 3) return 'warn';
  return 'neutral';
}

export default function DriverVerification() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search,  setSearch]  = useState('');
  const searchDebounced = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Cambiar búsqueda o tamaño vuelve a la página 1 (sin pedir dos veces);
  // reqId descarta respuestas viejas (peticiones que se pisan).
  const filterKey = `${searchDebounced.trim()}|${pageSize}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);
  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  async function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchDebounced.trim()) params.append('search', searchDebounced.trim());
      const data = await apiFetch<PendingPagedResponse>(`${API.drivers}/drivers/pending/paged?${params.toString()}`);
      if (id !== reqId.current) return;
      setDrivers(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (id !== reqId.current) return;
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los conductores.');
      setDrivers([]); setTotal(0);
    } finally { if (id === reqId.current) setLoading(false); }
  }

  const columns: Column<PendingDriver>[] = [
    { key: 'name', header: 'Conductor', priority: 1, width: '28%',
      render: d => <PersonCell name={d.fullName} src={fileUrl('drivers', d.profilePhotoUrl)} sub={`Registrado ${fmtDate(d.createdAt)}`} /> },
    { key: 'status', header: 'Estado', priority: 1, render: d => <DriverStatusBadge status={d.status} /> },
    { key: 'next', header: 'Qué falta', priority: 1, mobileLabel: 'Qué falta',
      render: d => {
        const step = NEXT_STEP[d.status] ?? NEXT_STEP[1];
        return (
          <span className="small d-inline-flex align-items-start gap-2">
            <i className={`fa-solid ${step.who === 'admin' ? 'fa-user-check' : 'fa-hourglass-half'} mt-1`}
               style={{ color: step.who === 'admin' ? 'var(--bugie-primary-soft)' : 'var(--bugie-muted)' }} aria-hidden="true" />
            <span>{step.text}</span>
          </span>
        );
      } },
    { key: 'wait', header: 'Esperando', priority: 2,
      render: d => {
        const days = daysSince(d.createdAt);
        return <StatusBadge tone={waitTone(days)} size="sm">{days === 0 ? 'Hoy' : `${days} día${days === 1 ? '' : 's'}`}</StatusBadge>;
      } },
  ];

  return (
    <Page
      title="Verificación de conductores"
      subtitle={loading ? 'Cargando bandeja…' : total === 0 ? 'No hay conductores esperando revisión.' : `${total} conductor${total !== 1 ? 'es' : ''} esperando revisión.`}
      icon="fa-id-card"
      helpKey="driver-verification"
      actions={[{ label: 'Actualizar', icon: 'fa-rotate-right', onClick: load, loading }]}
    >
      <SectionCard flush tourId="verif-list">
        <div className="p-3" data-tour="verif-search">
          <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por nombre, correo, documento o placa…" />
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={drivers}
          rowKey={d => d.id}
          loading={loading}
          onRowClick={d => navigate(`/admin/conductores/${d.id}?tab=documentos`)}
          inlineActions
          actions={d => [{ label: 'Revisar', icon: 'fa-magnifying-glass', onClick: () => navigate(`/admin/conductores/${d.id}?tab=documentos`) }]}
          empty={searchDebounced
            ? { title: 'Sin resultados', text: `No hay conductores pendientes que coincidan con «${searchDebounced}».`, icon: 'fa-magnifying-glass' }
            : { variant: 'done', title: 'Todo al día', text: 'No hay conductores pendientes de revisión.' }}
        />

        <div className="px-3">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10, 25, 50]} />
        </div>
      </SectionCard>
    </Page>
  );
}
