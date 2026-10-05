import { FormEvent, useEffect, useRef, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import { PERMS, usePermissions } from '../../state/permissions';
import { driverByUserPath } from '../../components/EntityLinks';
import {
  ActionItem, Column, DataTable, Drawer, Field, FilterBar, FormGrid, Page, Pagination, SectionCard, Select, Skeleton, StatusBadge, Tone,
  useConfirm, useDebouncedValue, useTabParam, useToast,
} from '../../components/ui';
import { Avatar, InfoRow, PersonCell, fileUrl, fmtDate } from './people/PeopleShared';
import {
  AccountAccessCard, AccountAuditList, AccountIdentity, DeactivatedBadge, DeletedAccountBanner, DeletedBadge, DocFields, DocValue, IdentityCard,
  IncompleteBadge, NameFields, NamesValue, docNumberError, fmtDocument, namesErrors,
} from './people/AccountShared';

interface User extends AccountIdentity {
  id: string; fullName: string; email: string;
  phone: string; role: string; isActive: boolean; createdAt: string;
  /// Solo para role='admin'. Null si todavía no se le asignó rol.
  adminRoleId: string | null;
  profilePhotoUrl?: string | null;
}

/// Rol administrativo (de /auth/admin/security/roles).
interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

interface UsersPagedResponse {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

/// Conteos calculados en BD (respetan los filtros enviados).
interface UsersStatsResponse {
  total: number;
  activos: number;
  pasajeros: number;
  conductores: number;
}

const EMPTY_STATS: UsersStatsResponse = { total: 0, activos: 0, pasajeros: 0, conductores: 0 };

const ROLE_CFG: Record<string, { label: string; tone: Tone; icon: string }> = {
  passenger: { label: 'Pasajero',  tone: 'primary', icon: 'fa-user' },
  driver:    { label: 'Conductor', tone: 'info',    icon: 'fa-car-side' },
  admin:     { label: 'Admin',     tone: 'bad',     icon: 'fa-shield-halved' },
};

// 'deleted' = solo cuentas eliminadas (por defecto el backend no las devuelve).
const ROLE_FILTERS = ['all', 'passenger', 'driver', 'admin', 'deleted'];

export default function Users() {
  const toast   = useToast();
  const confirm = useConfirm();
  const [roleFilter, setRoleFilter] = useTabParam(ROLE_FILTERS, 'rol');
  const [users,    setUsers]    = useState<User[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const searchDebounced = useDebouncedValue(search, 300);
  const [stats, setStats] = useState<UsersStatsResponse>(EMPTY_STATS);
  // Conteos por rol (se toman cuando el filtro es "Todos") para mostrarlos en los chips.
  const [roleCounts, setRoleCounts] = useState<UsersStatsResponse | null>(null);
  const [deletedCount, setDeletedCount] = useState<number | undefined>(undefined);
  const [acting, setActing] = useState<string | null>(null);
  // Ficha de la cuenta (identidad, eliminada/restaurar, historial).
  const [viewing, setViewing] = useState<User | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  // ── Roles administrativos (solo super_admin) ──
  const { isSuperAdmin, has } = usePermissions();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [assigning, setAssigning] = useState<User | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Usuario logueado: no puede cambiarse su propio rol (se bloquearía fuera del sistema).
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('bugie_admin_user');
      if (raw) setCurrentUserId(JSON.parse(raw).userId ?? null);
    } catch { /* sin sesión guardada */ }
  }, []);

  // Roles asignables desde la UI: nunca el super_admin (se maneja por SQL).
  const assignableRoles = roles.filter(r => !r.isSystem);

  useEffect(() => {
    if (!isSuperAdmin) return;
    apiFetch<AdminRole[]>(`${API.auth}/auth/admin/security/roles`).then(setRoles).catch(() => {});
  }, [isSuperAdmin]);

  // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces); reqId descarta
  // respuestas viejas para que una petición lenta no pise a la más nueva.
  const filterKey = `${roleFilter}|${searchDebounced.trim()}|${pageSize}`;
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
      const pagedParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const statsParams = new URLSearchParams();
      const deletedParams = new URLSearchParams({ deleted: 'true' });
      if (roleFilter === 'deleted') {
        pagedParams.append('deleted', 'true');
        statsParams.append('deleted', 'true');
      } else if (roleFilter !== 'all') {
        pagedParams.append('role', roleFilter);
        statsParams.append('role', roleFilter);
      }
      if (searchDebounced.trim()) {
        pagedParams.append('search', searchDebounced.trim());
        statsParams.append('search', searchDebounced.trim());
        deletedParams.append('search', searchDebounced.trim());
      }

      const [pagedRes, statsRes, deletedRes] = await Promise.all([
        apiFetch<UsersPagedResponse>(`${API.auth}/auth/users/paged?${pagedParams.toString()}`),
        apiFetch<UsersStatsResponse>(`${API.auth}/auth/users/stats?${statsParams.toString()}`),
        apiFetch<UsersStatsResponse>(`${API.auth}/auth/users/stats?${deletedParams.toString()}`).catch(() => null),
      ]);

      if (id !== reqId.current) return;
      setUsers(pagedRes.items ?? []);
      setTotal(pagedRes.total ?? 0);
      const st = statsRes ?? EMPTY_STATS;
      setStats(st);
      if (roleFilter === 'all') setRoleCounts(st);
      setDeletedCount(deletedRes?.total);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar los usuarios.');
    } finally { if (id === reqId.current) setLoading(false); }
  }

  async function deactivate(u: User) {
    const res = await confirm({
      title: `¿Desactivar a ${u.fullName}?`,
      message: 'Ya no podrá iniciar sesión en Bugie y se cerrarán todas sus sesiones abiertas. Podrás reactivarla después.',
      tone: 'danger', confirmText: 'Desactivar cuenta',
      reason: 'optional', reasonMaxLength: 500,
      reasonPlaceholder: 'Ej.: Reportes de mal comportamiento.',
    });
    if (!res) return;
    setActing(u.id);
    try {
      await apiFetch(`${API.auth}/auth/users/${u.id}/deactivate`, { method: 'PUT', body: JSON.stringify({ reason: res.reason || null }) });
      // Solo actualizamos la fila y el conteo de activos (sin recargar todo).
      setUsers(prev => prev.map(x => x.id === u.id
        ? { ...x, isActive: false, deactivatedAt: new Date().toISOString(), deactivatedReason: res.reason || null } : x));
      if (u.isActive) setStats(s => ({ ...s, activos: Math.max(0, s.activos - 1) }));
      toast.success('Cuenta desactivada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al desactivar.');
    } finally { setActing(null); }
  }

  async function reactivate(u: User) {
    const res = await confirm({
      title: `¿Reactivar a ${u.fullName}?`,
      message: 'Podrá volver a iniciar sesión con su correo y contraseña.',
      confirmText: 'Reactivar cuenta',
      reason: 'optional', reasonMaxLength: 500,
    });
    if (!res) return;
    setActing(u.id);
    try {
      await apiFetch(`${API.auth}/auth/users/${u.id}/reactivate`, { method: 'PUT', body: JSON.stringify({ reason: res.reason || null }) });
      toast.success('Cuenta reactivada.');
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al reactivar.');
    } finally { setActing(null); }
  }

  /// Por qué no se puede asignar rol a este admin (o null si sí se puede).
  function roleLock(u: User): 'self' | 'protected' | null {
    if (u.id === currentUserId) return 'self';
    if (roles.some(r => r.id === u.adminRoleId && r.isSystem)) return 'protected';
    return null;
  }

  function rowActions(u: User): ActionItem[] {
    const deleted = !!u.deletedAt;
    const canAssign = isSuperAdmin && u.role === 'admin' && !roleLock(u) && !deleted;
    return [
      { label: 'Ver cuenta', icon: 'fa-id-card', onClick: () => setViewing(u) },
      { label: 'Ver ficha del pasajero', icon: 'fa-eye', to: `/admin/pasajeros/${u.id}`, hidden: u.role !== 'passenger' || !has(PERMS.ViewPassengers) },
      { label: 'Ver ficha del conductor', icon: 'fa-eye', to: driverByUserPath(u.id), hidden: u.role !== 'driver' || !has(PERMS.ViewDrivers) },
      { label: 'Asignar rol', icon: 'fa-user-shield', onClick: () => setAssigning(u), hidden: !canAssign },
      // Una cuenta eliminada ya no puede iniciar sesión: desactivar no aplica.
      { label: 'Reactivar cuenta', icon: 'fa-user-check', separator: true,
        onClick: () => reactivate(u), disabled: acting === u.id, hidden: !u.deactivatedAt || u.role === 'admin' || deleted },
      { label: 'Desactivar cuenta', icon: 'fa-user-slash', danger: true, separator: true,
        onClick: () => deactivate(u), disabled: acting === u.id, hidden: !!u.deactivatedAt || u.role === 'admin' || deleted },
    ];
  }

  const columns: Column<User>[] = [
    { key: 'name', header: 'Usuario', priority: 1, width: '32%',
      render: u => <PersonCell name={u.fullName} sub={u.email} tone={ROLE_CFG[u.role]?.tone} muted={!!u.deletedAt} /> },
    { key: 'role', header: 'Tipo', priority: 1,
      render: u => {
        const role = ROLE_CFG[u.role] ?? { label: u.role, tone: 'neutral' as Tone, icon: 'fa-user' };
        const adminRole = roles.find(r => r.id === u.adminRoleId);
        const lock = u.role === 'admin' && isSuperAdmin ? roleLock(u) : null;
        return (
          <span className="d-inline-flex flex-wrap gap-1">
            <StatusBadge tone={role.tone} icon={role.icon} size="sm">{role.label}</StatusBadge>
            {/* Admin: rol administrativo asignado (amarillo si no tiene). */}
            {u.role === 'admin' && (
              <StatusBadge tone={!adminRole || adminRole.isSystem ? 'warn' : 'primary'} icon={adminRole?.isSystem ? 'fa-crown' : 'fa-user-shield'} size="sm">
                {adminRole?.name ?? 'Sin rol'}
              </StatusBadge>
            )}
            {lock === 'self' && <StatusBadge tone="neutral" icon="fa-user" size="sm" title="No puedes cambiar tu propio rol">Tú</StatusBadge>}
            {lock === 'protected' && <StatusBadge tone="warn" icon="fa-lock" size="sm" title="El rol super_admin solo se cambia por SQL">Protegido</StatusBadge>}
          </span>
        );
      } },
    { key: 'status', header: 'Estado', priority: 1,
      render: u => u.deletedAt
        ? <DeletedBadge deletedAt={u.deletedAt} deletedReason={u.deletedReason} />
        : (
          <span className="d-inline-flex flex-wrap gap-1">
            {u.deactivatedAt
              ? <DeactivatedBadge deactivatedAt={u.deactivatedAt} deactivatedReason={u.deactivatedReason} />
              : <StatusBadge tone={u.isActive ? 'ok' : 'neutral'} dot>{u.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>}
            {u.needsProfileCompletion && <IncompleteBadge />}
          </span>
        ) },
    { key: 'doc', header: 'Documento', priority: 3, render: u => fmtDocument(u) ?? '—' },
    { key: 'phone', header: 'Teléfono', priority: 3, render: u => u.phone || '—' },
    { key: 'createdAt', header: 'Registro', priority: 2, render: u => fmtDate(u.createdAt) },
  ];

  const rc = roleCounts;
  return (
    <Page
      title="Usuarios"
      subtitle="Todas las cuentas de Bugie: pasajeros, conductores y administradores."
      icon="fa-users"
      helpKey="users"
      actions={[
        { label: 'Nuevo admin', icon: 'fa-user-plus', variant: 'primary', onClick: () => setCreatingAdmin(true), hidden: !isSuperAdmin },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: load, loading },
      ]}
    >
      <SectionCard flush tourId="users-list">
        <div className="p-3" data-tour="users-filters">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nombre, correo, teléfono o documento"
            chips={[
              { value: 'all',       label: 'Todos',       count: rc?.total },
              { value: 'passenger', label: 'Pasajeros',   count: rc?.pasajeros },
              { value: 'driver',    label: 'Conductores', count: rc?.conductores },
              { value: 'admin',     label: 'Admins' },
              { value: 'deleted',   label: 'Eliminadas',  count: deletedCount },
            ]}
            chip={roleFilter}
            onChipChange={setRoleFilter}
            actions={!loading && roleFilter !== 'deleted' && (
              <StatusBadge tone="ok" icon="fa-circle-dot">{stats.activos.toLocaleString('es-PE')} activos de {stats.total.toLocaleString('es-PE')}</StatusBadge>
            )}
          />
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={users}
          rowKey={u => u.id}
          loading={loading}
          actions={rowActions}
          onRowClick={u => setViewing(u)}
          empty={roleFilter === 'deleted' && !searchDebounced
            ? { title: 'Sin cuentas eliminadas', text: 'Ninguna cuenta ha sido eliminada.', icon: 'fa-user-xmark' }
            : { title: 'Sin resultados', text: 'No hay usuarios que coincidan con la búsqueda.', icon: 'fa-user-slash' }}
        />

        <div className="px-3">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      </SectionCard>

      <AssignRoleDrawer
        user={assigning}
        roles={assignableRoles}
        onClose={() => setAssigning(null)}
        onSaved={() => { setAssigning(null); toast.success('Rol actualizado.'); load(); }}
      />

      <AccountDrawer
        user={viewing}
        roleLabel={viewing ? ROLE_CFG[viewing.role]?.label ?? viewing.role : ''}
        onClose={() => setViewing(null)}
        onChanged={load}
      />

      <CreateAdminDrawer
        open={creatingAdmin}
        roles={assignableRoles}
        onClose={() => setCreatingAdmin(false)}
        onCreated={() => { setCreatingAdmin(false); toast.success('Administrador creado.'); load(); }}
      />
    </Page>
  );
}

/// Descripción del rol elegido, para que el super_admin sepa qué permisos da.
function RoleHint({ role, fallback }: { role?: AdminRole; fallback?: string }) {
  const text = role?.description || fallback;
  if (!text) return null;
  return (
    <div className="small bx-tone-primary rounded-3 p-2 mt-2" style={{ background: 'var(--tone-bg)' }}>
      <i className="fa-solid fa-circle-info me-2" style={{ color: 'var(--tone)' }} aria-hidden="true" />{text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Asignar (o quitar) el rol administrativo de un usuario admin.
// ─────────────────────────────────────────────────────────────────────────
function AssignRoleDrawer({ user, roles, onClose, onSaved }: {
  user: User | null;
  roles: AdminRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // '' = quitar rol (deja AdminRoleId en NULL).
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Al abrir con otro usuario, precargar su rol actual.
  useEffect(() => { setSelectedId(user?.adminRoleId ?? ''); setError(null); }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`${API.auth}/auth/admin/security/users/assign-role`, {
        method: 'PUT',
        body: JSON.stringify({ userId: user.id, roleId: selectedId === '' ? null : selectedId }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al asignar el rol.');
    } finally { setSaving(false); }
  }

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      busy={saving}
      dirty="auto"
      title="Asignar rol administrativo"
      description={user ? `${user.fullName} · ${user.email}` : undefined}
      footer={
        <div className="d-flex gap-2 justify-content-end w-100">
          <button className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-bugie" onClick={save} disabled={saving}>
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Guardando…</>
              : <><i className="fa-solid fa-floppy-disk me-2" aria-hidden="true" />Guardar</>}
          </button>
        </div>
      }
    >
      <Field label="Rol a asignar" help="Define qué módulos del panel puede ver este administrador.">
        <Select
          value={selectedId}
          onChange={setSelectedId}
          options={[
            { value: '', label: 'Sin rol (quitar permisos)', icon: 'fa-ban' },
            ...roles.map(r => ({ value: r.id, label: `${r.name}${r.isSystem ? ' (sistema)' : ''}`, icon: 'fa-user-shield' })),
          ]}
        />
      </Field>
      {selectedId && <RoleHint role={roles.find(r => r.id === selectedId)} fallback="Este rol no tiene descripción." />}

      {selectedId === '' && user?.adminRoleId && (
        <div className="alert alert-warning small mt-3 mb-0">
          <i className="fa-solid fa-triangle-exclamation me-2" aria-hidden="true" />
          Al quitar el rol, este admin ya no podrá ver ningún módulo del panel.
        </div>
      )}
      {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Crear un nuevo administrador. El backend exige asignarle un rol al crearlo.
// ─────────────────────────────────────────────────────────────────────────
const EMPTY_FORM = { email: '', password: '', phone: '', roleId: '' };
const EMPTY_NAMES: NamesValue = { firstNames: '', lastNamePaternal: '', lastNameMaternal: '' };
const EMPTY_DOC: DocValue = { docType: 'DNI', docNumber: '' };

function CreateAdminDrawer({ open, roles, onClose, onCreated }: {
  open: boolean;
  roles: AdminRole[];   // sin super_admin
  onClose: () => void;
  onCreated: () => void;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState(EMPTY_FORM);
  const [names, setNames] = useState<NamesValue>(EMPTY_NAMES);
  const [doc, setDoc] = useState<DocValue>(EMPTY_DOC);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Formulario limpio cada vez que se abre, con el primer rol preseleccionado.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, roleId: roles[0]?.id ?? '' });
      setNames(EMPTY_NAMES); setDoc(EMPTY_DOC); setTouched(false); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setTouched(true);

    // Validaciones de cliente (el backend también valida)
    const nameErr = Object.values(namesErrors(names)).find(Boolean);
    if (nameErr)                  { setError(nameErr); return; }
    const docErr = docNumberError(doc.docType, doc.docNumber);
    if (docErr)                   { setError(docErr); return; }
    if (!form.email.trim())       { setError('El correo es obligatorio.'); return; }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (!form.phone.trim())       { setError('El teléfono es obligatorio.'); return; }
    if (!form.roleId)             { setError('Debes elegir un rol.'); return; }

    const fullName = [names.firstNames, names.lastNamePaternal, names.lastNameMaternal].map(x => x.trim()).filter(Boolean).join(' ');
    const ok = await confirm({
      title: '¿Crear este administrador?',
      message: <>Se creará la cuenta de <strong>{fullName}</strong> ({form.email.trim()}) con el rol <strong>{roles.find(r => r.id === form.roleId)?.name}</strong>.</>,
      confirmText: 'Crear admin',
    });
    if (!ok) return;

    setSaving(true);
    try {
      await apiFetch(`${API.auth}/auth/admin/security/users`, {
        method: 'POST',
        body: JSON.stringify({
          firstNames:       names.firstNames.trim(),
          lastNamePaternal: names.lastNamePaternal.trim(),
          lastNameMaternal: names.lastNameMaternal.trim() || null,
          docType:          doc.docType,
          docNumber:        doc.docNumber,
          email:    form.email.trim(),
          password: form.password,
          phone:    form.phone.trim(),
          roleId:   form.roleId,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el admin.');
    } finally { setSaving(false); }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={saving}
      dirty="auto"
      title="Nuevo administrador"
      description="Podrá entrar al panel con el correo y la contraseña que definas."
      footer={
        <div className="d-flex gap-2 justify-content-end w-100">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="create-admin-form" className="btn btn-bugie" disabled={saving || roles.length === 0}>
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Creando…</>
              : <><i className="fa-solid fa-user-plus me-2" aria-hidden="true" />Crear admin</>}
          </button>
        </div>
      }
    >
      <form id="create-admin-form" onSubmit={save} className="bx-form" noValidate>
        <NameFields value={names} onChange={setNames} touched={touched} />
        <DocFields value={doc} onChange={setDoc} touched={touched} />
        <FormGrid>
          <Field label="Correo" required>
            <input type="email" className="form-control" value={form.email} onChange={set('email')} placeholder="juan@bugie.pe" autoComplete="off" />
          </Field>
          <Field label="Teléfono" required>
            <input className="form-control" value={form.phone} onChange={set('phone')} placeholder="+51 999 999 999" autoComplete="off" inputMode="tel" />
          </Field>
          <Field label="Contraseña" required help="Mínimo 6 caracteres. El admin podrá cambiarla después al ingresar.">
            <input type="password" className="form-control" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          <Field label="Rol" required error={roles.length === 0 ? 'Primero crea un rol en el módulo de Seguridad.' : undefined}>
            <Select
              value={form.roleId || null}
              onChange={roleId => setForm(p => ({ ...p, roleId }))}
              placeholder={roles.length === 0 ? 'No hay roles disponibles' : 'Elige un rol'}
              disabled={roles.length === 0}
              options={roles.map(r => ({ value: r.id, label: r.name, icon: 'fa-user-shield' }))}
            />
          </Field>
        </FormGrid>
        <RoleHint role={roles.find(r => r.id === form.roleId)} />
        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </form>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ficha de la cuenta: identidad (corregir nombres / documento), cuenta
// eliminada (restaurar) e historial de cuenta. Sirve para cualquier rol.
// ─────────────────────────────────────────────────────────────────────────
function AccountDrawer({ user, roleLabel, onClose, onChanged }: {
  user: User | null; roleLabel: string; onClose: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditKey, setAuditKey] = useState(0);

  async function load(id: string) {
    setError(null);
    try {
      setDetail(await apiFetch<User>(`${API.auth}/auth/admin/users/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la cuenta.');
    }
  }

  useEffect(() => {
    setDetail(null);
    if (user) load(user.id);
  }, [user]);

  // Tras corregir o restaurar: recargar la ficha, el historial y la lista.
  const refresh = () => { if (user) { load(user.id); setAuditKey(k => k + 1); onChanged(); } };

  const u = detail ?? user;
  return (
    <Drawer open={!!user} onClose={onClose} size="lg" title="Cuenta del usuario"
            description={u ? `${roleLabel} · ${u.email}` : undefined}>
      {u && (
        <div className="d-grid gap-3">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <Avatar src={fileUrl('auth', u.profilePhotoUrl)} name={u.fullName} size={56} />
            <div style={{ minWidth: 0 }}>
              <div className="h6 fw-bold mb-1" style={{ overflowWrap: 'anywhere' }}>{u.fullName}</div>
              <span className="d-inline-flex flex-wrap gap-1">
                {u.deletedAt
                  ? <StatusBadge tone="bad" icon="fa-user-xmark" size="sm">Cuenta eliminada</StatusBadge>
                  : u.deactivatedAt
                    ? <DeactivatedBadge deactivatedAt={u.deactivatedAt} deactivatedReason={u.deactivatedReason} />
                    : <StatusBadge tone={u.isActive ? 'ok' : 'neutral'} dot size="sm">{u.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>}
                {u.needsProfileCompletion && <IncompleteBadge />}
              </span>
            </div>
          </div>

          {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}

          {u.deletedAt && (
            <DeletedAccountBanner userId={u.id} deletedAt={u.deletedAt} deletedReason={u.deletedReason} onRestored={refresh}
              note="Mientras esté eliminada no puede iniciar sesión ni se le puede desactivar o asignar rol." />
          )}

          {!detail && !error ? (
            <SectionCard><Skeleton count={4} /></SectionCard>
          ) : detail && (
            <>
              <IdentityCard userId={detail.id} info={detail} onChanged={refresh} />
              <AccountAccessCard userId={detail.id} info={detail} onChanged={refresh} />
              <SectionCard title="Contacto" icon="fa-address-book">
                <InfoRow icon="fa-envelope" label="Correo">{detail.email}</InfoRow>
                <InfoRow icon="fa-phone" label="Teléfono">{detail.phone || '—'}</InfoRow>
                <InfoRow icon="fa-calendar-plus" label="Registrado">{fmtDate(detail.createdAt)}</InfoRow>
              </SectionCard>
              <AccountAuditList userId={detail.id} reloadKey={auditKey} />
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
