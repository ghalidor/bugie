import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';
import { usePermissions } from '../../state/permissions';

interface User {
  id: string; fullName: string; email: string;
  phone: string; role: string; isActive: boolean; createdAt: string;
  /// Solo presente para users con role='admin'. Null si todavía no se le asignó rol.
  adminRoleId: string | null;
}

/// Rol administrativo (de /auth/admin/security/roles).
interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

/// Respuesta del endpoint /auth/users/paged.
/// items = página actual, total = cuántos matchean en TOTAL en BD.
interface UsersPagedResponse {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

/// Respuesta del endpoint /auth/users/stats.
/// Cuentas calculadas en BD (no en cliente) para que funcionen con
/// cualquier cantidad de usuarios.
interface UsersStatsResponse {
  total: number;
  activos: number;
  pasajeros: number;
  conductores: number;
}

const ROLE_CFG: Record<string, { label: string; color: string; icon: string }> = {
  passenger: { label: 'Pasajero',  color: '#818cf8', icon: 'fa-user'        },
  driver:    { label: 'Conductor', color: '#34d399', icon: 'fa-car-side'     },
  admin:     { label: 'Admin',     color: '#f87171', icon: 'fa-shield-halved' },
};

const PAGE_SIZE = 25;

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function Users() {
  const [users,      setUsers]      = useState<User[]>([]);
  const [total,      setTotal]      = useState(0);    // total que matchea los filtros
  const [page,       setPage]       = useState(1);    // 1-based
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  // searchDebounced es lo que realmente viaja al backend (tras 300ms sin escribir).
  // Así no disparamos un request por cada tecla.
  const [searchDebounced, setSearchDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  // KPIs agregados (calculados en BD). Reflejan los filtros actuales.
  const [stats, setStats] = useState<UsersStatsResponse>({
    total: 0, activos: 0, pasajeros: 0, conductores: 0,
  });
  const [acting,     setActing]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  // ── Asignación de roles (solo si el usuario actual es super_admin) ──
  // Lista de roles administrativos disponibles para asignar a otros admins.
  const { isSuperAdmin } = usePermissions();
  const [roles, setRoles]   = useState<AdminRole[]>([]);
  const [assigning, setAssigning] = useState<User | null>(null);
  // Modal de creación de nuevo admin
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // ID del usuario actualmente logueado (super_admin). Lo usamos para impedir
  // que se edite/cambie de rol a sí mismo y se auto-bloquee fuera del sistema.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('bugie_admin_user');
      if (raw) {
        const obj = JSON.parse(raw);
        setCurrentUserId(obj.userId ?? null);
      }
    } catch {}
  }, []);

  // Roles disponibles para ASIGNAR: nunca el super_admin (lo manejamos por SQL).
  // Sólo se asignan roles "normales" desde la UI.
  const assignableRoles = roles.filter(r => !r.isSystem);

  // Cargar la lista de roles una vez (solo si el usuario es super_admin).
  // Si no lo es, no se le muestra el botón "Asignar rol" igual.
  useEffect(() => {
    if (!isSuperAdmin) return;
    apiFetch<AdminRole[]>(`${API.auth}/auth/admin/security/roles`)
      .then(setRoles)
      .catch(() => {});
  }, [isSuperAdmin]);

  // Debounce del search: cada vez que el usuario escribe, esperamos 300ms.
  // Si en 300ms no volvió a escribir, recién entonces actualizamos el valor
  // que dispara el fetch.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearchDebounced(search);
      setPage(1); // al buscar, volvemos a la primera página
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search]);

  // Cada vez que cambia algún filtro o la página → fetch paginado.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, roleFilter, searchDebounced]);

  // Al cambiar el rol, volver a página 1 (no quedarse en página 12 si ahora hay solo 3).
  useEffect(() => { setPage(1); }, [roleFilter]);

  async function load() {
    setLoading(true); setError(null);
    try {
      // Parámetros base (paginación)
      const pagedParams = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      // Parámetros para stats (sin paginación, solo filtros)
      const statsParams = new URLSearchParams();

      if (roleFilter !== 'all') {
        pagedParams.append('role', roleFilter);
        statsParams.append('role', roleFilter);
      }
      if (searchDebounced.trim()) {
        pagedParams.append('search', searchDebounced.trim());
        statsParams.append('search', searchDebounced.trim());
      }

      // Pedimos lista y KPIs EN PARALELO (2 requests, mismo tiempo que 1).
      const [pagedRes, statsRes] = await Promise.all([
        apiFetch<UsersPagedResponse>(
          `${API.auth}/auth/users/paged?${pagedParams.toString()}`),
        apiFetch<UsersStatsResponse>(
          `${API.auth}/auth/users/stats?${statsParams.toString()}`),
      ]);

      setUsers(pagedRes.items ?? []);
      setTotal(pagedRes.total ?? 0);
      setStats(statsRes ?? { total: 0, activos: 0, pasajeros: 0, conductores: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los usuarios.');
    } finally { setLoading(false); }
  }

  async function deactivate(id: string) {
    setActing(id);
    try {
      await apiFetch(`${API.auth}/auth/users/${id}/deactivate`, { method: 'PUT' });
      // Optimización: actualizamos solo la fila en pantalla, no recargamos
      // toda la página. También bajamos el KPI "Activos" en 1 sin pedir stats
      // de nuevo (ahorra un round-trip).
      setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: false } : u));
      setStats(s => ({ ...s, activos: Math.max(0, s.activos - 1) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al desactivar.');
    } finally { setActing(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx   = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de todos los usuarios registrados en la plataforma."
        icon="fa-solid fa-users"
        actions={
          isSuperAdmin ? (
            <button className="btn btn-bugie text-white"
                    onClick={() => setCreatingAdmin(true)}>
              <i className="fa-solid fa-user-plus me-2" />Nuevo admin
            </button>
          ) : undefined
        }
      />

      {/* KPIs (calculados en BD, respetan los filtros actuales).
          Cuando filtras "Conductores" o buscas "jose", los conteos
          se ajustan a lo que estás viendo. Funcionan con cualquier
          cantidad de usuarios porque son COUNT(*) con índices. */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total',       value: stats.total,       color: '#818cf8', icon: 'fa-users'      },
          { label: 'Activos',     value: stats.activos,     color: '#34d399', icon: 'fa-circle-dot' },
          { label: 'Pasajeros',   value: stats.pasajeros,   color: '#38bdf8', icon: 'fa-user'       },
          { label: 'Conductores', value: stats.conductores, color: '#f59e0b', icon: 'fa-car-side'   },
        ].map(k => (
          <div className="col-6 col-xl-3" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading ? '…' : k.value.toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="position-relative flex-grow-1" style={{ maxWidth: 320 }}>
          <i className="fa-solid fa-magnifying-glass position-absolute" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--bugie-muted)', fontSize: '0.8rem' }} />
          <input
            className="form-control ps-4"
            placeholder="Buscar por nombre o correo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {[
            { key: 'all',       label: 'Todos'       },
            { key: 'passenger', label: 'Pasajeros'   },
            { key: 'driver',    label: 'Conductores' },
            { key: 'admin',     label: 'Admins'      },
          ].map(f => (
            <button key={f.key}
              className={`btn btn-sm rounded-pill ${roleFilter === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
              onClick={() => setRoleFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto" onClick={load}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : users.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
            <i className="fa-solid fa-user-slash" />
          </div>
          <div className="fw-semibold mb-1">Sin resultados</div>
          <div className="small bugie-muted">No hay usuarios que coincidan con la búsqueda.</div>
        </div>
      ) : (
        <>
          <div className="d-flex flex-column gap-2">
            {users.map(u => {
              const role = ROLE_CFG[u.role] ?? { label: u.role, color: '#94a3b8', icon: 'fa-user' };
              return (
                <div key={u.id} className="bugie-card px-3 py-3">
                  <div className="d-flex align-items-center gap-3">

                    {/* Avatar */}
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                      background: role.color + '22',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.85rem', color: role.color,
                    }}>
                      {initials(u.fullName)}
                    </div>

                    {/* Info principal */}
                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="fw-semibold">{u.fullName}</span>
                        <span className="badge rounded-pill" style={{ background: role.color + '22', color: role.color, fontSize: '0.72rem' }}>
                          <i className={`fa-solid ${role.icon} me-1`} style={{ fontSize: '0.65rem' }} />
                          {role.label}
                        </span>
                        <span className="badge rounded-pill" style={{
                          background: u.isActive ? '#34d39922' : '#94a3b822',
                          color: u.isActive ? '#34d399' : '#94a3b8',
                          fontSize: '0.72rem',
                        }}>
                          {u.isActive ? '● Activo' : '● Inactivo'}
                        </span>

                        {/* Si es admin, mostramos el rol administrativo asignado.
                            Si no tiene rol, lo marcamos en amarillo (necesita asignación). */}
                        {u.role === 'admin' && (() => {
                          const adminRole = roles.find(r => r.id === u.adminRoleId);
                          const hasRole = !!adminRole;
                          const isSystem = adminRole?.isSystem;
                          return (
                            <span className="badge rounded-pill" style={{
                              background: !hasRole ? '#f59e0b22'
                                        : isSystem  ? '#f59e0b22'
                                        : '#818cf822',
                              color: !hasRole ? '#f59e0b'
                                   : isSystem ? '#f59e0b'
                                   : '#818cf8',
                              fontSize: '0.72rem',
                            }}>
                              <i className={`fa-solid ${isSystem ? 'fa-crown' : 'fa-user-shield'} me-1`}
                                 style={{ fontSize: '0.65rem' }} />
                              {adminRole?.name ?? 'Sin rol'}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="small bugie-muted text-truncate">{u.email}</div>
                      {u.phone && <div className="small bugie-muted">{u.phone}</div>}
                    </div>

                    {/* Fecha y acciones */}
                    <div className="text-end flex-shrink-0">
                      <div className="small bugie-muted mb-2">
                        {new Date(u.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>

                      <div className="d-flex gap-2 justify-content-end">
                        {/* Botón "Asignar rol" — visible si:
                            (1) el usuario actual es super_admin
                            (2) el user de la fila tiene role='admin'
                            (3) NO es uno mismo (evita auto-bloquearse)
                            (4) el rol actual del user NO es super_admin
                                (super_admin solo se cambia por SQL para evitar perder el último) */}
                        {(() => {
                          if (!isSuperAdmin || u.role !== 'admin') return null;

                          // ¿Es el usuario actualmente logueado? No puede editarse a sí mismo.
                          const isSelf = u.id === currentUserId;

                          // ¿El user de la fila tiene rol super_admin?
                          const targetIsSuperAdmin = !!roles.find(r =>
                            r.id === u.adminRoleId && r.isSystem);

                          if (isSelf) {
                            return (
                              <span className="badge rounded-pill" style={{
                                background: 'rgba(148,163,184,0.15)', color: '#94a3b8',
                                fontSize: '0.7rem', padding: '0.4rem 0.7rem',
                              }} title="No puedes cambiar tu propio rol">
                                <i className="fa-solid fa-user me-1" />Tú mismo
                              </span>
                            );
                          }

                          if (targetIsSuperAdmin) {
                            return (
                              <span className="badge rounded-pill" style={{
                                background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                                fontSize: '0.7rem', padding: '0.4rem 0.7rem',
                              }} title="El rol super_admin solo se cambia por SQL">
                                <i className="fa-solid fa-lock me-1" />Protegido
                              </span>
                            );
                          }

                          return (
                            <button
                              className="btn btn-sm btn-bugie-outline rounded-pill"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => setAssigning(u)}>
                              <i className="fa-solid fa-user-shield me-1" />Asignar rol
                            </button>
                          );
                        })()}

                        {u.isActive && u.role !== 'admin' && (
                          <button
                            className="btn btn-sm btn-outline-danger rounded-pill"
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => deactivate(u.id)}
                            disabled={acting === u.id}>
                            {acting === u.id
                              ? <span className="spinner-border spinner-border-sm" />
                              : <><i className="fa-solid fa-user-slash me-1" />Desactivar</>
                            }
                          </button>
                        )}
                      </div>
                      {!u.isActive && (
                        <span className="small" style={{ color: '#94a3b8' }}>
                          <i className="fa-solid fa-lock me-1" />Desactivado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{total.toLocaleString('es-PE')}</strong>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(1)} disabled={page === 1}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">
                Página {page} de {totalPages}
              </span>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal para asignar/quitar rol administrativo */}
      {assigning && (
        <AssignRoleModal
          user={assigning}
          roles={assignableRoles}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            load();  // recarga la lista para que se vea el rol nuevo
          }}
        />
      )}

      {/* Modal para crear un nuevo admin. Solo lo muestra el botón "Nuevo admin",
          que solo aparece para super_admin. */}
      {creatingAdmin && (
        <CreateAdminModal
          roles={assignableRoles}
          onClose={() => setCreatingAdmin(false)}
          onCreated={() => {
            setCreatingAdmin(false);
            load();  // recarga la lista para que aparezca el nuevo admin
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modal: asignar (o quitar) el rol administrativo de un usuario admin.
// Solo aparece para usuarios con role='admin' y solo si el operador actual
// es super_admin.
// ─────────────────────────────────────────────────────────────────────────
function AssignRoleModal({ user, roles, onClose, onSaved }: {
  user: User;
  roles: AdminRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Estado del select: rol elegido. Si el usuario ya tenía rol, lo pre-seleccionamos.
  // Valor especial '' = quitar rol (deja AdminRoleId en NULL).
  const [selectedId, setSelectedId] = useState<string>(user.adminRoleId ?? '');
  const [saving, setSaving]         = useState(false);
  const [error,  setError]          = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      await apiFetch(`${API.auth}/auth/admin/security/users/assign-role`, {
        method: 'PUT',
        body: JSON.stringify({
          userId: user.id,
          // '' significa "quitar rol" → mandamos null al backend
          roleId: selectedId === '' ? null : selectedId,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al asignar el rol.');
    } finally { setSaving(false); }
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(480px, 100%)', maxHeight: '90vh',
        background: 'var(--bugie-surface)', borderRadius: 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="d-flex align-items-center gap-2">
            <i className="fa-solid fa-user-shield" style={{ color: '#818cf8' }} />
            <div>
              <div className="fw-bold">Asignar rol administrativo</div>
              <div className="small bugie-muted">{user.fullName} · {user.email}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '1.25rem' }}>
          <label className="form-label small bugie-muted text-uppercase mb-2">
            Rol a asignar
          </label>
          <select
            className="form-select mb-3"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}>
            <option value="">— Sin rol (quitar permisos) —</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}{r.isSystem ? ' (sistema)' : ''}
              </option>
            ))}
          </select>

          {/* Mostramos la descripción del rol seleccionado, si tiene */}
          {(() => {
            const sel = roles.find(r => r.id === selectedId);
            if (!sel) return null;
            return (
              <div className="small bugie-muted mb-3" style={{
                background: 'rgba(129,140,248,0.08)',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                borderLeft: '3px solid #818cf8',
              }}>
                {sel.description || 'Este rol no tiene descripción.'}
              </div>
            );
          })()}

          {error && <div className="alert alert-danger small mb-2">{error}</div>}

          {/* Aviso si quita rol */}
          {selectedId === '' && user.adminRoleId && (
            <div className="alert alert-warning small mb-2">
              <i className="fa-solid fa-triangle-exclamation me-2" />
              Al quitar el rol, este admin ya no podrá ver ningún módulo del panel.
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end">
            <button className="btn btn-bugie-outline" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-bugie text-white" onClick={save} disabled={saving}>
              {saving
                ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                : <><i className="fa-solid fa-floppy-disk me-2" />Guardar</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modal: crear un nuevo usuario administrador. El backend exige que se le
// asigne un rol al crearlo (no se permite crear admins "sin rol").
// Solo super_admin puede usar este formulario.
// ─────────────────────────────────────────────────────────────────────────
function CreateAdminModal({ roles, onClose, onCreated }: {
  roles: AdminRole[];   // sin super_admin (no se asigna a admins nuevos)
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    roleId: roles[0]?.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validaciones de cliente (el backend también valida)
    if (!form.fullName.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!form.email.trim())    { setError('El correo es obligatorio.'); return; }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (!form.phone.trim())    { setError('El teléfono es obligatorio.'); return; }
    if (!form.roleId)          { setError('Debes elegir un rol.'); return; }

    setSaving(true);
    try {
      await apiFetch(`${API.auth}/auth/admin/security/users`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
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

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(520px, 100%)', maxHeight: '90vh',
        background: 'var(--bugie-surface)', borderRadius: 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="d-flex align-items-center gap-2">
            <i className="fa-solid fa-user-plus" style={{ color: '#818cf8' }} />
            <div className="fw-bold">Nuevo administrador</div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={save} style={{ padding: '1.25rem', overflowY: 'auto' }}>
          <div className="mb-3">
            <label className="form-label small">Nombre completo <span className="text-danger">*</span></label>
            <input className="form-control" value={form.fullName} onChange={set('fullName')}
                   placeholder="Juan Pérez" autoFocus />
          </div>

          <div className="mb-3">
            <label className="form-label small">Correo <span className="text-danger">*</span></label>
            <input type="email" className="form-control" value={form.email} onChange={set('email')}
                   placeholder="juan@bugie.pe" />
          </div>

          <div className="mb-3">
            <label className="form-label small">Contraseña <span className="text-danger">*</span></label>
            <input type="password" className="form-control" value={form.password} onChange={set('password')}
                   placeholder="Mínimo 6 caracteres" />
            <div className="form-text small">
              El admin podrá cambiarla después al ingresar.
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small">Teléfono <span className="text-danger">*</span></label>
            <input className="form-control" value={form.phone} onChange={set('phone')}
                   placeholder="+51 999 999 999" />
          </div>

          <div className="mb-3">
            <label className="form-label small">Rol <span className="text-danger">*</span></label>
            <select className="form-select" value={form.roleId} onChange={set('roleId')}>
              {roles.length === 0 && <option value="">— No hay roles disponibles —</option>}
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {roles.length === 0 && (
              <div className="form-text small text-warning">
                Primero crea un rol en el módulo de Seguridad.
              </div>
            )}
            {/* Descripción del rol seleccionado, si tiene */}
            {(() => {
              const sel = roles.find(r => r.id === form.roleId);
              if (!sel?.description) return null;
              return (
                <div className="small bugie-muted mt-2" style={{
                  background: 'rgba(129,140,248,0.08)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  borderLeft: '3px solid #818cf8',
                }}>
                  {sel.description}
                </div>
              );
            })()}
          </div>

          {error && <div className="alert alert-danger small mb-3">{error}</div>}

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-bugie-outline"
                    onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-bugie text-white"
                    disabled={saving || roles.length === 0}>
              {saving
                ? <><span className="spinner-border spinner-border-sm me-2" />Creando…</>
                : <><i className="fa-solid fa-user-plus me-2" />Crear admin</>}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
