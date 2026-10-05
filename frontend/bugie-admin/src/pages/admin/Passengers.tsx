import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  Column, DataTable, FilterBar, Page, Pagination, SectionCard, StatusBadge, useDebouncedValue, useTabParam, useToast,
} from '../../components/ui';
import { csvDateTag, csvDateTime, csvResultMessage, downloadCsv, fetchAllPages } from '../../state/csv';
import { PersonCell, fmtDate } from './people/PeopleShared';
import { DeletedBadge, IncompleteBadge, fmtDocument } from './people/AccountShared';

interface User {
  id:         string;
  email:      string;
  fullName:   string;
  phone:      string;
  role:       string;
  isActive:   boolean;
  isVerified: boolean;
  createdAt:  string;
  docType?:   string | null;
  docNumber?: string | null;
  needsProfileCompletion?: boolean;
  deletedAt?: string | null;
  deletedReason?: string | null;
}

interface UsersPagedResponse {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

interface UsersStatsResponse {
  total: number;
  activos: number;
  pasajeros: number;
  conductores: number;
  verificados: number;
  noVerificados: number;
}

const EMPTY_STATS: UsersStatsResponse = { total: 0, activos: 0, pasajeros: 0, conductores: 0, verificados: 0, noVerificados: 0 };

// Filtro → valor del parámetro `verified` del backend. "Eliminadas" usa deleted=true
// (por defecto el backend no devuelve cuentas eliminadas).
const FILTERS = ['pending', 'verified', 'all', 'deleted'] as const;
const VERIFIED_PARAM: Record<string, string | null> = { pending: 'false', verified: 'true', all: null, deleted: null };

export default function Passengers() {
  const navigate = useNavigate();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  // El filtro vive en la URL (?filtro=) para que "Volver" desde el detalle lo conserve.
  const [filter, setFilter] = useTabParam([...FILTERS], 'filtro');
  const [users,  setUsers]  = useState<User[]>([]);
  const [total,  setTotal]  = useState(0);
  const [page,   setPage]   = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const searchDebounced = useDebouncedValue(search, 300);
  const [stats, setStats]   = useState<UsersStatsResponse>(EMPTY_STATS);
  const [deletedCount, setDeletedCount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error,  setError]  = useState<string | null>(null);

  // Al cambiar filtro, búsqueda o tamaño de página → volver a la página 1 (sin
  // pedir dos veces); reqId descarta respuestas viejas (peticiones que se pisan).
  const filterKey = `${filter}|${searchDebounced.trim()}|${pageSize}`;
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

  /** Filtro y búsqueda del listado (sin página): los usa también el CSV. */
  function listParams() {
    const params = new URLSearchParams();
    const verifiedParam = VERIFIED_PARAM[filter];
    if (verifiedParam !== null) params.append('verified', verifiedParam);
    if (filter === 'deleted') params.append('deleted', 'true');
    if (searchDebounced.trim()) params.append('search', searchDebounced.trim());
    return params;
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const base = listParams();
      const all = await fetchAllPages(async (p, size) => {
        const params = new URLSearchParams(base);
        params.append('page', String(p));
        params.append('pageSize', String(size));
        return apiFetch<UsersPagedResponse>(`${API.auth}/auth/admin/passengers/paged?${params.toString()}`);
      });
      downloadCsv(
        ['Nombre', 'Correo', 'Teléfono', 'Tipo de documento', 'N° de documento', 'Verificado', 'Cuenta', 'Registro', 'Cuenta eliminada', 'Id del usuario'],
        all.items.map(u => [
          u.fullName, u.email, u.phone, u.docType ?? '', u.docNumber ?? '',
          u.isVerified ? 'Sí' : 'No', u.deletedAt ? 'Eliminada' : u.isActive ? 'Activa' : 'Inactiva',
          csvDateTime(u.createdAt), csvDateTime(u.deletedAt), u.id,
        ]),
        `pasajeros-${csvDateTag()}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'pasajero', 'pasajeros'));
      else toast.success(csvResultMessage(all, 'pasajero', 'pasajeros'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar los pasajeros.');
    } finally { setExporting(false); }
  }

  async function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const verifiedParam = VERIFIED_PARAM[filter];
      const pagedParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      // Los contadores NO llevan el filtro de verificación: así cada chip muestra
      // su total real (antes, en "Pendientes", el contador de verificados salía en 0).
      const statsParams = new URLSearchParams();
      if (verifiedParam !== null) pagedParams.append('verified', verifiedParam);
      if (filter === 'deleted') pagedParams.append('deleted', 'true');
      const deletedParams = new URLSearchParams(statsParams);
      if (searchDebounced.trim()) {
        pagedParams.append('search', searchDebounced.trim());
        statsParams.append('search', searchDebounced.trim());
        deletedParams.append('search', searchDebounced.trim());
      }
      deletedParams.append('deleted', 'true');

      const [pagedRes, statsRes, deletedRes] = await Promise.all([
        apiFetch<UsersPagedResponse>(`${API.auth}/auth/admin/passengers/paged?${pagedParams.toString()}`),
        apiFetch<UsersStatsResponse>(`${API.auth}/auth/admin/passengers/stats?${statsParams.toString()}`),
        apiFetch<UsersStatsResponse>(`${API.auth}/auth/admin/passengers/stats?${deletedParams.toString()}`).catch(() => null),
      ]);

      if (id !== reqId.current) return;
      setUsers(pagedRes.items ?? []);
      setTotal(pagedRes.total ?? 0);
      setStats(statsRes ?? EMPTY_STATS);
      setDeletedCount(deletedRes?.total);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar los pasajeros.');
    } finally { if (id === reqId.current) setLoading(false); }
  }

  const columns: Column<User>[] = [
    { key: 'name', header: 'Pasajero', priority: 1, width: '34%',
      render: u => <PersonCell name={u.fullName} sub={u.email} tone={u.isVerified ? 'ok' : 'warn'} muted={!!u.deletedAt} /> },
    { key: 'status', header: 'Verificación', priority: 1, mobileLabel: 'Estado',
      render: u => u.deletedAt
        ? <DeletedBadge deletedAt={u.deletedAt} deletedReason={u.deletedReason} />
        : (
          <span className="d-inline-flex flex-wrap gap-1">
            {u.isVerified
              ? <StatusBadge tone="ok" icon="fa-circle-check">Verificado</StatusBadge>
              : <StatusBadge tone="warn" icon="fa-clock">Por verificar</StatusBadge>}
            {u.needsProfileCompletion && <IncompleteBadge />}
          </span>
        ) },
    { key: 'doc', header: 'Documento', priority: 3, render: u => fmtDocument(u) ?? '—' },
    { key: 'phone', header: 'Teléfono', priority: 2, render: u => u.phone || '—' },
    { key: 'active', header: 'Cuenta', priority: 3,
      render: u => <StatusBadge tone={u.isActive ? 'ok' : 'neutral'} dot>{u.isActive ? 'Activa' : 'Inactiva'}</StatusBadge> },
    { key: 'createdAt', header: 'Registro', priority: 1, mobileLabel: 'Registro', render: u => fmtDate(u.createdAt) },
  ];

  return (
    <Page
      title="Pasajeros"
      subtitle="Revisa el DNI de los nuevos pasajeros y consulta su información."
      icon="fa-users"
      helpKey="passengers"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, loading: exporting, disabled: !total },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: load, loading },
      ]}
    >
      <SectionCard flush tourId="passengers-list">
        <div className="p-3" data-tour="passengers-filters">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nombre, correo, teléfono o documento"
            chips={[
              { value: 'pending',  label: 'Por verificar', count: stats.noVerificados },
              { value: 'verified', label: 'Verificados',   count: stats.verificados },
              { value: 'all',      label: 'Todos',         count: stats.total },
              { value: 'deleted',  label: 'Eliminadas',    count: deletedCount },
            ]}
            chip={filter}
            onChipChange={setFilter}
          />
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={users}
          rowKey={u => u.id}
          loading={loading}
          onRowClick={u => navigate(`/admin/pasajeros/${u.id}`)}
          mobileSubtitle={u => u.email}
          actions={u => [
            { label: u.isVerified || u.deletedAt ? 'Ver detalle' : 'Revisar documentos', icon: u.isVerified || u.deletedAt ? 'fa-eye' : 'fa-id-card', to: `/admin/pasajeros/${u.id}` },
          ]}
          empty={filter === 'pending' && !searchDebounced
            ? { variant: 'done', title: 'Todo al día', text: 'No hay pasajeros esperando verificación.' }
            : filter === 'deleted' && !searchDebounced
            ? { title: 'Sin cuentas eliminadas', text: 'Ningún pasajero ha eliminado su cuenta.', icon: 'fa-user-xmark' }
            : { title: 'Sin pasajeros', text: searchDebounced ? `No hay resultados para «${searchDebounced}».` : 'No hay pasajeros en esta categoría.', icon: 'fa-users' }}
        />

        <div className="px-3">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      </SectionCard>
    </Page>
  );
}
