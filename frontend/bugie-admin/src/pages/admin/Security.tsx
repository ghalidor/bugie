import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';
import { usePermissions } from '../../state/permissions';

/// Página de gestión de roles y permisos administrativos.
/// Solo visible/usable por super_admin (el backend lo refuerza con 403).

interface Role {
  id:          string;
  name:        string;
  description: string | null;
  isSystem:    boolean;
  createdAt:   string;
  permissions: string[];
  userCount:   number;
}

interface Catalog {
  views:   string[];
  actions: string[];
}

// Etiquetas legibles para cada permiso (lo mismo del lado backend, pero solo display).
const LABELS: Record<string, string> = {
  // Vistas
  'view:dashboard':   'Ver dashboard',
  'view:users':       'Ver usuarios',
  'view:drivers':     'Ver conductores',
  'view:passengers':  'Ver pasajeros',
  'view:trips':       'Ver viajes',
  'view:payments':    'Ver pagos',
  'view:live_map':    'Ver monitoreo en vivo',
  'view:sos_center':  'Ver centro SOS',
  'view:landing':     'Ver gestión de landing',
  'view:community':   'Ver gestión de comunidad',
  'view:legal_docs':  'Ver documentos legales',
  'view:faq':         'Ver preguntas frecuentes',
  'view:reports':     'Ver reportes',
  'view:security':    'Ver módulo de seguridad',
  // Acciones (Fase 2 — sin efecto todavía)
  'action:approve_driver':    'Aprobar conductores',
  'action:approve_passenger': 'Aprobar pasajeros',
  'action:save_landing':      'Guardar landing',
  'action:create_community':  'Crear publicaciones',
  'action:edit_community':    'Editar publicaciones',
  'action:toggle_community':  'Publicar/ocultar',
  'action:save_legal_docs':   'Guardar documentos legales',
};

export default function Security() {
  const { isSuperAdmin, reload } = usePermissions();
  const [roles, setRoles]       = useState<Role[]>([]);
  const [catalog, setCatalog]   = useState<Catalog>({ views: [], actions: [] });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [editing, setEditing]   = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [rolesData, catData] = await Promise.all([
        apiFetch<Role[]>(`${API.auth}/auth/admin/security/roles`),
        apiFetch<Catalog>(`${API.auth}/auth/admin/security/permissions/catalog`),
      ]);
      setRoles(rolesData ?? []);
      setCatalog(catData ?? { views: [], actions: [] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar.');
    } finally { setLoading(false); }
  }

  async function deleteRole(role: Role) {
    if (role.isSystem) return;
    if (role.userCount > 0) {
      alert(`Este rol tiene ${role.userCount} usuario(s) asignados. Reasígnalos primero.`);
      return;
    }
    if (!confirm(`¿Borrar el rol "${role.name}"?`)) return;

    try {
      await apiFetch(`${API.auth}/auth/admin/security/roles/${role.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Error al borrar.');
    }
  }

  // Super_admin es quien tiene acceso completo. Si NO lo es, ni siquiera
  // mostramos la página (defensa en profundidad — el backend igual rechaza).
  if (!isSuperAdmin) {
    return (
      <>
        <PageHeader title="Seguridad" icon="fa-solid fa-user-shield" />
        <div className="alert alert-warning">
          Solo el super_admin puede acceder a este módulo.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Seguridad"
        subtitle="Roles y permisos del panel administrativo."
        icon="fa-solid fa-user-shield"
        actions={
          <button className="btn btn-bugie text-white"
                  onClick={() => setCreating(true)}>
            <i className="fa-solid fa-plus me-2" />Nuevo rol
          </button>
        }
      />

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : (
        <div className="row g-3">
          {roles.map(role => (
            <div className="col-md-6 col-xl-4" key={role.id}>
              <div className="bugie-card p-3 h-100">
                <div className="d-flex align-items-start justify-content-between mb-2">
                  <div>
                    <div className="d-flex align-items-center gap-2">
                      <i className={`fa-solid ${role.isSystem ? 'fa-crown' : 'fa-user-shield'}`}
                         style={{ color: role.isSystem ? '#f59e0b' : '#818cf8' }} />
                      <span className="fw-bold">{role.name}</span>
                      {role.isSystem && (
                        <span className="badge rounded-pill"
                              style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: '0.65rem' }}>
                          Sistema
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <div className="small bugie-muted mt-1">{role.description}</div>
                    )}
                  </div>
                </div>

                <div className="d-flex gap-3 small bugie-muted mb-3">
                  <span><i className="fa-solid fa-key me-1" />
                    {role.isSystem ? 'Todos los permisos' : `${role.permissions.length} permisos`}
                  </span>
                  <span><i className="fa-solid fa-users me-1" />{role.userCount} usuario(s)</span>
                </div>

                <div className="d-flex gap-2 mt-auto">
                  <button className="btn btn-sm btn-bugie-outline rounded-pill flex-grow-1"
                          onClick={() => setEditing(role)}
                          disabled={role.isSystem}>
                    <i className="fa-solid fa-pen me-1" />
                    {role.isSystem ? 'No editable' : 'Editar permisos'}
                  </button>
                  {!role.isSystem && (
                    <button className="btn btn-sm btn-outline-danger rounded-pill"
                            onClick={() => deleteRole(role)}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RoleEditor
          role={editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); reload(); }}
        />
      )}
      {creating && (
        <RoleCreator
          catalog={catalog}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Editor de permisos de un rol existente
// ─────────────────────────────────────────────────────────────────────────
function RoleEditor({ role, catalog, onClose, onSaved }: {
  role: Role; catalog: Catalog; onClose: () => void; onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  /// Permite seleccionar/deseleccionar varios permisos a la vez (usado por los
  /// botones "Todos" / "Ninguno" de cada categoría y los globales).
  function selectMany(perms: string[], add: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      perms.forEach(p => add ? next.add(p) : next.delete(p));
      return next;
    });
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      await apiFetch(`${API.auth}/auth/admin/security/roles/${role.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: Array.from(selected) }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally { setSaving(false); }
  }

  return (
    <PermsModal
      title={`Permisos del rol`}
      subtitle={role.name + (role.description ? ` · ${role.description}` : '')}
      icon="fa-user-shield"
      onClose={onClose}
      footer={
        <div className="d-flex gap-2 justify-content-end align-items-center">
          {error && <div className="text-danger small me-auto">{error}</div>}
          <button className="btn btn-bugie-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-bugie text-white" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                    : <><i className="fa-solid fa-floppy-disk me-2" />Guardar cambios</>}
          </button>
        </div>
      }>
      <PermsCheckboxes
        catalog={catalog}
        selected={selected}
        onToggle={toggle}
        onSelectMany={selectMany} />
    </PermsModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Crear un rol nuevo
// ─────────────────────────────────────────────────────────────────────────
function RoleCreator({ catalog, onClose, onCreated }: {
  catalog: Catalog; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  function selectMany(perms: string[], add: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      perms.forEach(p => add ? next.add(p) : next.delete(p));
      return next;
    });
  }

  async function save() {
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch(`${API.auth}/auth/admin/security/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permissions: Array.from(selected),
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear.');
    } finally { setSaving(false); }
  }

  return (
    <PermsModal
      title="Nuevo rol"
      subtitle="Define un conjunto de permisos para asignar a administradores."
      icon="fa-plus"
      onClose={onClose}
      footer={
        <div className="d-flex gap-2 justify-content-end align-items-center">
          {error && <div className="text-danger small me-auto">{error}</div>}
          <button className="btn btn-bugie-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-bugie text-white" onClick={save}
                  disabled={saving || !name.trim()}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Creando…</>
                    : <><i className="fa-solid fa-plus me-2" />Crear rol</>}
          </button>
        </div>
      }>
      {/* Datos del rol */}
      <div className="row g-3 mb-4">
        <div className="col-md-5">
          <label className="form-label small bugie-muted text-uppercase">
            Nombre <span className="text-danger">*</span>
          </label>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)}
            placeholder="ej. soporte, finanzas" />
        </div>
        <div className="col-md-7">
          <label className="form-label small bugie-muted text-uppercase">Descripción</label>
          <input className="form-control" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="¿Qué hace este rol?" />
        </div>
      </div>

      <PermsCheckboxes
        catalog={catalog}
        selected={selected}
        onToggle={toggle}
        onSelectMany={selectMany} />
    </PermsModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Categorías de permisos para agrupar visualmente en el modal.
// Coincide con la organización del sidebar para que el admin reconozca dónde
// va cada permiso. Si un permiso no está en ninguna categoría, cae en "Otros".
// ─────────────────────────────────────────────────────────────────────────
interface PermCategory {
  key:   string;
  title: string;
  icon:  string;
  color: string;
  perms: string[]; // strings de permisos pertenecientes a esta categoría
}

const VIEW_CATEGORIES: PermCategory[] = [
  {
    key: 'operations',
    title: 'Operaciones',
    icon: 'fa-bolt',
    color: '#38bdf8',
    perms: ['view:dashboard', 'view:live_map', 'view:sos_center'],
  },
  {
    key: 'management',
    title: 'Gestión',
    icon: 'fa-briefcase',
    color: '#818cf8',
    perms: ['view:users', 'view:passengers', 'view:drivers', 'view:trips', 'view:payments'],
  },
  {
    key: 'content',
    title: 'Contenido',
    icon: 'fa-palette',
    color: '#f59e0b',
    perms: ['view:landing', 'view:community', 'view:faq', 'view:legal_docs'],
  },
  {
    key: 'reports',
    title: 'Reportes',
    icon: 'fa-chart-line',
    color: '#10b981',
    perms: ['view:reports'],
  },
  {
    key: 'system',
    title: 'Sistema',
    icon: 'fa-lock',
    color: '#ef4444',
    perms: ['view:security'],
  },
];

const ACTION_CATEGORIES: PermCategory[] = [
  {
    key: 'approvals',
    title: 'Aprobaciones',
    icon: 'fa-circle-check',
    color: '#34d399',
    perms: ['action:approve_driver', 'action:approve_passenger'],
  },
  {
    key: 'content-actions',
    title: 'Edición de contenido',
    icon: 'fa-pen-to-square',
    color: '#f59e0b',
    perms: ['action:save_landing', 'action:create_community', 'action:edit_community',
            'action:toggle_community', 'action:save_legal_docs'],
  },
];

/// Mapea cada permiso a un icono específico (para mostrar al lado del nombre).
/// Si no hay match, usa un icono genérico.
const PERM_ICONS: Record<string, string> = {
  'view:dashboard':   'fa-gauge',
  'view:users':       'fa-users',
  'view:drivers':     'fa-car-side',
  'view:passengers':  'fa-user',
  'view:trips':       'fa-route',
  'view:payments':    'fa-credit-card',
  'view:live_map':    'fa-map-location-dot',
  'view:sos_center':  'fa-shield-halved',
  'view:landing':     'fa-paintbrush',
  'view:community':   'fa-people-group',
  'view:legal_docs':  'fa-gavel',
  'view:faq':         'fa-circle-question',
  'view:reports':     'fa-chart-line',
  'view:security':    'fa-user-shield',
  'action:approve_driver':    'fa-car-side',
  'action:approve_passenger': 'fa-user-check',
  'action:save_landing':      'fa-paintbrush',
  'action:create_community':  'fa-plus',
  'action:edit_community':    'fa-pen',
  'action:toggle_community':  'fa-eye',
  'action:save_legal_docs':   'fa-gavel',
};

// ─────────────────────────────────────────────────────────────────────────
// Modal con header sticky, footer sticky y cuerpo scrolleable.
// Acepta un footer opcional para no obligar a cada modal a inventar el suyo.
// ─────────────────────────────────────────────────────────────────────────
function PermsModal({ title, subtitle, icon, onClose, children, footer }: {
  title: string;
  subtitle?: string;
  icon?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(740px, 100%)', maxHeight: '92vh',
        background: 'var(--bugie-surface)', borderRadius: 18,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 70px rgba(0,0,0,0.5)',
      }}>
        {/* Header sticky */}
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)', flexShrink: 0 }}>
          <div className="d-flex align-items-center gap-3">
            {icon && (
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(129,140,248,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className={`fa-solid ${icon}`} style={{ color: '#818cf8' }} />
              </div>
            )}
            <div>
              <div className="fw-bold">{title}</div>
              {subtitle && <div className="small bugie-muted">{subtitle}</div>}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body scroll */}
        <div style={{ overflowY: 'auto', padding: '1.25rem', flexGrow: 1 }}>
          {children}
        </div>

        {/* Footer sticky (opcional) */}
        {footer && (
          <div className="p-3 border-top"
               style={{ borderColor: 'var(--bugie-border)', flexShrink: 0,
                        background: 'var(--bugie-surface)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Componente de checkboxes con diseño mejorado:
//   - Búsqueda para filtrar permisos rápidamente.
//   - Agrupado por categorías (Operaciones, Gestión, etc.).
//   - Toggle estilo switch en lugar de checkbox.
//   - Contador "X de N seleccionados" arriba.
//   - Botones por categoría: "Todos" / "Ninguno".
//   - Iconos específicos por permiso.
// ─────────────────────────────────────────────────────────────────────────
function PermsCheckboxes({ catalog, selected, onToggle, onSelectMany }: {
  catalog: Catalog;
  selected: Set<string>;
  onToggle: (p: string) => void;
  /// Permite seleccionar/deseleccionar de a varios (para botones por categoría).
  onSelectMany: (perms: string[], add: boolean) => void;
}) {
  const [search, setSearch] = useState('');

  /// Filtra los permisos por la búsqueda actual. Match tanto contra el código
  /// (view:trips) como contra la etiqueta legible ("Ver viajes").
  const matchSearch = (perm: string) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return perm.toLowerCase().includes(needle) ||
           (LABELS[perm] ?? '').toLowerCase().includes(needle);
  };

  /// Renderiza una sección de permisos (vista o acción) con sus categorías.
  /// `kind` solo se usa para diferenciar el color de fondo del header.
  const renderSection = (
    sectionTitle: string,
    sectionIcon: string,
    sectionDescription: string | null,
    allPerms: string[],
    categories: PermCategory[],
    isAction: boolean,
  ) => {
    // Permisos que están en el catálogo PERO no encajan en ninguna categoría: caen en "Otros".
    const usedInCategories = new Set(categories.flatMap(c => c.perms));
    const otherPerms = allPerms.filter(p => !usedInCategories.has(p));
    const allCategories = otherPerms.length > 0
      ? [...categories, {
          key: 'other', title: 'Otros', icon: 'fa-circle-question',
          color: '#94a3b8', perms: otherPerms,
        } as PermCategory]
      : categories;

    // Filtramos categorías cuyos perms TODOS quedaron fuera de la búsqueda.
    const visibleCategories = allCategories
      .map(c => ({ ...c, perms: c.perms.filter(p => allPerms.includes(p) && matchSearch(p)) }))
      .filter(c => c.perms.length > 0);

    if (visibleCategories.length === 0) return null;

    // Contador global de la sección
    const totalInSection = allPerms.length;
    const selectedInSection = allPerms.filter(p => selected.has(p)).length;

    return (
      <div className="mb-3">
        {/* Header de la sección */}
        <div className="d-flex align-items-center justify-content-between mb-2 px-1">
          <div className="d-flex align-items-center gap-2">
            <i className={`fa-solid ${sectionIcon}`}
               style={{ color: isAction ? '#f59e0b' : '#818cf8', fontSize: '0.85rem' }} />
            <span className="fw-semibold small">{sectionTitle}</span>
            <span className="badge rounded-pill" style={{
              background: 'rgba(129,140,248,0.15)', color: '#818cf8',
              fontSize: '0.7rem',
            }}>
              {selectedInSection} / {totalInSection}
            </span>
            {isAction && (
              <span className="badge rounded-pill" style={{
                background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                fontSize: '0.65rem',
              }}>
                <i className="fa-solid fa-clock me-1" style={{ fontSize: '0.55rem' }} />
                Fase 2
              </span>
            )}
          </div>
        </div>
        {sectionDescription && (
          <div className="small bugie-muted mb-2 px-1">{sectionDescription}</div>
        )}

        {/* Categorías */}
        <div className="d-flex flex-column gap-3">
          {visibleCategories.map(cat => {
            const allSelected = cat.perms.every(p => selected.has(p));
            const noneSelected = cat.perms.every(p => !selected.has(p));

            return (
              <div key={cat.key} style={{
                border: '1px solid var(--bugie-border)',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.02)',
              }}>
                {/* Header de categoría */}
                <div className="d-flex align-items-center justify-content-between px-3 py-2"
                     style={{
                       background: cat.color + '12',
                       borderBottom: '1px solid var(--bugie-border)',
                     }}>
                  <div className="d-flex align-items-center gap-2">
                    <i className={`fa-solid ${cat.icon}`}
                       style={{ color: cat.color, fontSize: '0.85rem' }} />
                    <span className="fw-semibold small">{cat.title}</span>
                    <span className="small bugie-muted" style={{ fontSize: '0.72rem' }}>
                      ({cat.perms.filter(p => selected.has(p)).length}/{cat.perms.length})
                    </span>
                  </div>
                  <div className="d-flex gap-1">
                    <button type="button"
                      className="btn btn-sm rounded-pill px-2 py-0"
                      style={{ fontSize: '0.7rem',
                               background: allSelected ? cat.color + '33' : 'transparent',
                               border: `1px solid ${cat.color}55`,
                               color: cat.color }}
                      onClick={() => onSelectMany(cat.perms, true)}
                      disabled={allSelected}>
                      <i className="fa-solid fa-check me-1" />Todos
                    </button>
                    <button type="button"
                      className="btn btn-sm rounded-pill px-2 py-0"
                      style={{ fontSize: '0.7rem',
                               background: noneSelected ? 'rgba(148,163,184,0.2)' : 'transparent',
                               border: '1px solid rgba(148,163,184,0.3)',
                               color: '#94a3b8' }}
                      onClick={() => onSelectMany(cat.perms, false)}
                      disabled={noneSelected}>
                      Ninguno
                    </button>
                  </div>
                </div>

                {/* Permisos */}
                <div className="d-flex flex-column">
                  {cat.perms.map((p, i) => {
                    const isOn = selected.has(p);
                    const icon = PERM_ICONS[p] ?? 'fa-key';
                    return (
                      <label key={p}
                        className="d-flex align-items-center gap-3 px-3 py-2"
                        style={{
                          cursor: 'pointer',
                          background: isOn ? cat.color + '08' : 'transparent',
                          borderTop: i === 0 ? 'none' : '1px solid var(--bugie-border)',
                          opacity: isAction ? 0.92 : 1,
                          transition: 'background 0.15s',
                        }}>
                        {/* Icono del permiso */}
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: isOn ? cat.color + '22' : 'rgba(148,163,184,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'background 0.15s',
                        }}>
                          <i className={`fa-solid ${icon}`}
                             style={{ color: isOn ? cat.color : '#94a3b8', fontSize: '0.85rem' }} />
                        </div>

                        {/* Label y código */}
                        <div className="flex-grow-1 min-w-0">
                          <div className="small fw-semibold">{LABELS[p] ?? p}</div>
                          <div className="bugie-muted" style={{
                            fontSize: '0.68rem', fontFamily: 'monospace',
                          }}>{p}</div>
                        </div>

                        {/* Toggle estilo switch (visual mejor que checkbox) */}
                        <div onClick={(e) => { e.preventDefault(); onToggle(p); }} style={{
                          width: 38, height: 22, borderRadius: 11,
                          background: isOn ? cat.color : 'rgba(148,163,184,0.3)',
                          position: 'relative', cursor: 'pointer',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}>
                          <div style={{
                            position: 'absolute',
                            top: 2,
                            left: isOn ? 18 : 2,
                            width: 18, height: 18, borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'left 0.2s',
                          }} />
                        </div>

                        {/* Checkbox real, oculto, para accesibilidad/teclado */}
                        <input type="checkbox" checked={isOn}
                          onChange={() => onToggle(p)}
                          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Contador global
  const allCatalogPerms = [...catalog.views, ...catalog.actions];
  const totalSelected = allCatalogPerms.filter(p => selected.has(p)).length;

  return (
    <>
      {/* Barra superior: búsqueda + contador + atajos globales */}
      <div className="d-flex gap-2 align-items-center mb-3 flex-wrap"
           style={{ position: 'sticky', top: 0, zIndex: 2,
                    background: 'var(--bugie-surface)',
                    paddingBottom: 8, marginTop: -4 }}>
        <div className="position-relative flex-grow-1" style={{ minWidth: 200 }}>
          <i className="fa-solid fa-magnifying-glass position-absolute"
             style={{ left: 12, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--bugie-muted)', fontSize: '0.8rem' }} />
          <input
            className="form-control form-control-sm ps-4"
            placeholder="Buscar permiso…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="badge rounded-pill px-3 py-2" style={{
          background: 'rgba(129,140,248,0.15)', color: '#818cf8', fontSize: '0.8rem',
        }}>
          <i className="fa-solid fa-check-double me-1" />
          {totalSelected} seleccionados
        </span>
        <button type="button"
          className="btn btn-sm btn-bugie-outline rounded-pill"
          onClick={() => onSelectMany(allCatalogPerms, true)}
          disabled={totalSelected === allCatalogPerms.length}>
          <i className="fa-solid fa-square-check me-1" />Todo
        </button>
        <button type="button"
          className="btn btn-sm btn-bugie-outline rounded-pill"
          onClick={() => onSelectMany(allCatalogPerms, false)}
          disabled={totalSelected === 0}>
          <i className="fa-regular fa-square me-1" />Nada
        </button>
      </div>

      {/* Sección Vistas */}
      {renderSection(
        'Vistas del menú',
        'fa-eye',
        'Controlan qué módulos del admin verá el usuario en el menú lateral.',
        catalog.views,
        VIEW_CATEGORIES,
        false,
      )}

      {/* Sección Acciones */}
      {catalog.actions.length > 0 && renderSection(
        'Acciones',
        'fa-bolt',
        'Definidos para uso futuro. Hoy todavía no se validan en el backend.',
        catalog.actions,
        ACTION_CATEGORIES,
        true,
      )}

      {/* Mensaje si la búsqueda no encontró nada */}
      {search.trim() && totalSelected === 0 &&
       allCatalogPerms.filter(p => matchSearch(p)).length === 0 && (
        <div className="text-center py-3 bugie-muted small">
          <i className="fa-solid fa-magnifying-glass fa-lg mb-2 d-block" />
          No hay permisos que coincidan con "{search}".
        </div>
      )}
    </>
  );
}
