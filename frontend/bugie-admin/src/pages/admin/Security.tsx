import { useEffect, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import { usePermissions } from '../../state/permissions';
import {
  Drawer, EmptyState, Field, FilterBar, IconButton, Page, SectionCard, Skeleton, StatusBadge, Switch,
  Tooltip, useConfirm, useToast,
} from '../../components/ui';
import './siteAdmin.scss';

/// Gestión de roles y permisos del panel.
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

// Etiquetas legibles para cada permiso (solo display).
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
  'view:verification':         'Ver verificación de conductores',
  'view:driver_payouts':       'Ver pagos a conductores',
  'view:commissions':          'Ver comisiones',
  'view:rewards':              'Ver fidelización (puntos)',
  'view:messages':             'Ver mensajes de contacto',
  'view:settings':             'Ver configuración',
  'view:notifications_config': 'Ver configuración de avisos',
  'view:complaints':           'Ver libro de reclamaciones',
  'view:company':              'Ver datos de la empresa',
  // Acciones (Fase 2: todavía sin efecto)
  'action:approve_driver':    'Aprobar conductores',
  'action:approve_passenger': 'Aprobar pasajeros',
  'action:save_landing':      'Guardar landing',
  'action:create_community':  'Crear publicaciones',
  'action:edit_community':    'Editar publicaciones',
  'action:toggle_community':  'Publicar/ocultar',
  'action:save_legal_docs':   'Guardar documentos legales',
};

interface PermCategory {
  key:   string;
  title: string;
  icon:  string;
  perms: string[];
}

// Coincide con la organización del menú para que se reconozca dónde va cada permiso.
const VIEW_CATEGORIES: PermCategory[] = [
  { key: 'operations', title: 'Operaciones', icon: 'fa-bolt',      perms: ['view:dashboard', 'view:live_map', 'view:sos_center'] },
  { key: 'management', title: 'Gestión',     icon: 'fa-briefcase', perms: ['view:users', 'view:passengers', 'view:drivers', 'view:verification', 'view:trips', 'view:payments', 'view:driver_payouts', 'view:commissions', 'view:rewards'] },
  { key: 'content',    title: 'Contenido',   icon: 'fa-palette',   perms: ['view:landing', 'view:community', 'view:faq', 'view:legal_docs', 'view:messages', 'view:complaints'] },
  { key: 'reports',    title: 'Reportes',    icon: 'fa-chart-line', perms: ['view:reports'] },
  { key: 'system',     title: 'Sistema',     icon: 'fa-lock',      perms: ['view:security', 'view:settings', 'view:notifications_config', 'view:company'] },
];

const ACTION_CATEGORIES: PermCategory[] = [
  { key: 'approvals',       title: 'Aprobaciones',         icon: 'fa-circle-check',  perms: ['action:approve_driver', 'action:approve_passenger'] },
  { key: 'content-actions', title: 'Edición de contenido', icon: 'fa-pen-to-square', perms: ['action:save_landing', 'action:create_community', 'action:edit_community', 'action:toggle_community', 'action:save_legal_docs'] },
];

export default function Security() {
  const { isSuperAdmin, reload, loading: permsLoading } = usePermissions();
  const toast   = useToast();
  const confirm = useConfirm();

  const [roles,   setRoles]   = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Catalog>({ views: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // Drawer: null = cerrado; 'new' = crear; Role = editar.
  const [editing, setEditing] = useState<Role | 'new' | null>(null);

  useEffect(() => { if (isSuperAdmin) load(); /* eslint-disable-next-line */ }, [isSuperAdmin]);

  async function load() {
    setLoading(true); setLoadErr(null);
    try {
      const [rolesData, catData] = await Promise.all([
        apiFetch<Role[]>(`${API.auth}/auth/admin/security/roles`),
        apiFetch<Catalog>(`${API.auth}/auth/admin/security/permissions/catalog`),
      ]);
      setRoles(rolesData ?? []);
      setCatalog(catData ?? { views: [], actions: [] });
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : 'No se pudieron cargar los roles.');
    } finally { setLoading(false); }
  }

  async function deleteRole(role: Role) {
    if (role.isSystem) return;
    if (role.userCount > 0) {
      toast.warning(`Este rol tiene ${role.userCount} usuario(s) asignado(s). Reasígnalos primero.`, 'No se puede eliminar');
      return;
    }
    const ok = await confirm({
      title: `¿Eliminar el rol «${role.name}»?`,
      message: 'Se borrará de forma permanente con todos sus permisos.',
      tone: 'danger',
      confirmText: 'Eliminar rol',
      typeToConfirm: 'ELIMINAR',
    });
    if (!ok) return;
    try {
      await apiFetch(`${API.auth}/auth/admin/security/roles/${role.id}`, { method: 'DELETE' });
      toast.success(`Rol «${role.name}» eliminado.`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar.');
    }
  }

  // Defensa en profundidad: sin super_admin no se muestra nada (el backend igual rechaza).
  if (permsLoading) {
    return (
      <Page title="Seguridad: roles y permisos" icon="fa-user-shield">
        <SectionCard><Skeleton height={20} count={4} /></SectionCard>
      </Page>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Page title="Seguridad" icon="fa-user-shield">
        <SectionCard>
          <EmptyState variant="error" icon="fa-lock" title="Acceso restringido"
                      text="Solo el super_admin puede gestionar roles y permisos." />
        </SectionCard>
      </Page>
    );
  }

  const catalogTotal = catalog.views.length + catalog.actions.length;

  return (
    <Page
      title="Seguridad: roles y permisos"
      subtitle="Define qué puede ver y hacer cada tipo de administrador."
      icon="fa-user-shield"
      helpKey="security"
      actions={[
        { label: 'Nuevo rol', icon: 'fa-plus', variant: 'primary', onClick: () => setEditing('new') },
        { label: 'Actualizar', icon: 'fa-rotate-right', variant: 'secondary', onClick: load, loading },
      ]}
    >
      {loadErr && (
        <div className="sa-note bx-tone-bad" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
        </div>
      )}

      {loading ? (
        <div className="sa-roles">
          {[0, 1, 2].map(i => <SectionCard key={i}><Skeleton height={20} count={4} /></SectionCard>)}
        </div>
      ) : (
        <div className="sa-roles" data-tour="sec-roles">
          {roles.map(role => {
            const count = role.isSystem ? catalogTotal : role.permissions.length;
            const pct = catalogTotal > 0 ? Math.round((count / catalogTotal) * 100) : 0;
            return (
              <SectionCard key={role.id} className="sa-anim">
                <div className="sa-role">
                  <div className="sa-role-head">
                    <span className={`sa-role-icon ${role.isSystem ? 'bx-tone-warn' : 'bx-tone-primary'}`} aria-hidden="true">
                      <i className={`fa-solid ${role.isSystem ? 'fa-crown' : 'fa-user-shield'}`} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="fw-bold" style={{ overflowWrap: 'anywhere' }}>{role.name}</span>
                        {role.isSystem && <StatusBadge size="sm" tone="warn">Sistema</StatusBadge>}
                      </div>
                      <div className="small bugie-muted">{role.description || 'Sin descripción'}</div>
                    </div>
                  </div>

                  <div className="sa-role-meta">
                    <StatusBadge size="sm" tone="primary" icon="fa-key">
                      {role.isSystem ? 'Todos los permisos' : `${count} de ${catalogTotal} permisos`}
                    </StatusBadge>
                    <StatusBadge size="sm" tone={role.userCount > 0 ? 'info' : 'neutral'} icon="fa-users">
                      {role.userCount === 1 ? '1 usuario' : `${role.userCount} usuarios`}
                    </StatusBadge>
                  </div>

                  <div className="sa-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                       aria-label="Permisos asignados">
                    <span style={{ width: `${pct}%` }} />
                  </div>

                  <div className="sa-role-foot">
                    {role.isSystem ? (
                      <span className="small bugie-muted"><i className="fa-solid fa-lock me-1" aria-hidden="true" />No editable</span>
                    ) : (
                      <>
                        <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill" onClick={() => setEditing(role)}>
                          <i className="fa-solid fa-pen me-1" aria-hidden="true" />Editar permisos
                        </button>
                        <IconButton icon="fa-trash" variant="danger" size="sm"
                                    label={role.userCount > 0 ? 'Tiene usuarios: reasígnalos antes de eliminar' : 'Eliminar rol'}
                                    onClick={() => deleteRole(role)} />
                      </>
                    )}
                  </div>
                </div>
              </SectionCard>
            );
          })}

          <button type="button" className="sa-add d-grid gap-2 align-content-center" data-tour="sec-new"
                  style={{ minHeight: '10rem', marginTop: 0 }} onClick={() => setEditing('new')}>
            <i className="fa-solid fa-plus fa-lg" aria-hidden="true" />
            Crear un rol nuevo
          </button>
        </div>
      )}

      <RoleDrawer
        role={editing}
        catalog={catalog}
        onClose={() => setEditing(null)}
        onSaved={created => {
          setEditing(null);
          toast.success(created ? 'Rol creado.' : 'Permisos actualizados.');
          load(); reload();
        }}
      />
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Un solo panel para crear y editar.
// El backend solo permite cambiar los permisos de un rol existente, así que
// al editar, el nombre y la descripción se muestran sin poder modificarse.
// ─────────────────────────────────────────────────────────────────────────
function RoleDrawer({ role, catalog, onClose, onSaved }: {
  role: Role | 'new' | null; catalog: Catalog; onClose: () => void; onSaved: (created: boolean) => void;
}) {
  const confirm = useConfirm();
  const existing = role && role !== 'new' ? role : null;

  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [initialKey, setInitialKey]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const snapshot = (n: string, d: string, s: Set<string>) => JSON.stringify([n, d, Array.from(s).sort()]);

  useEffect(() => {
    if (!role) return;
    const n = existing?.name ?? '';
    const d = existing?.description ?? '';
    const s = new Set(existing?.permissions ?? []);
    setName(n); setDescription(d); setSelected(s); setError(null);
    setInitialKey(snapshot(n, d, s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const dirty = !!role && snapshot(name, description, selected) !== initialKey;

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

  async function close() {
    if (saving) return;
    if (dirty && !(await confirm({
      title: '¿Cerrar sin guardar?', message: 'Los cambios de este rol se perderán.',
      confirmText: 'Cerrar sin guardar', cancelText: 'Seguir editando', tone: 'warning',
    }))) return;
    onClose();
  }

  async function save() {
    if (!existing && !name.trim()) { setError('El nombre es obligatorio.'); return; }
    // Quitar permisos a un rol que ya tiene usuarios: confirmar, porque pierden el acceso al momento.
    if (existing && existing.userCount > 0) {
      const removed = existing.permissions.filter(p => !selected.has(p));
      if (removed.length > 0) {
        const ok = await confirm({
          title: `¿Quitar ${removed.length === 1 ? 'este permiso' : `estos ${removed.length} permisos`}?`,
          message: (
            <div className="d-grid gap-2">
              <span>
                {existing.userCount === 1 ? '1 usuario tiene' : `${existing.userCount} usuarios tienen`} el rol «{existing.name}»
                {' '}y {existing.userCount === 1 ? 'perderá' : 'perderán'} el acceso a:
              </span>
              <ul className="mb-0 ps-3">{removed.map(p => <li key={p}>{LABELS[p] ?? p}</li>)}</ul>
            </div>
          ),
          confirmText: 'Quitar permisos', tone: 'warning',
        });
        if (!ok) return;
      }
    }
    setSaving(true); setError(null);
    try {
      if (existing) {
        await apiFetch(`${API.auth}/auth/admin/security/roles/${existing.id}/permissions`, {
          method: 'PUT',
          body: JSON.stringify({ permissions: Array.from(selected) }),
        });
      } else {
        await apiFetch(`${API.auth}/auth/admin/security/roles`, {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            permissions: Array.from(selected),
          }),
        });
      }
      onSaved(!existing);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally { setSaving(false); }
  }

  return (
    <Drawer
      open={!!role}
      onClose={close}
      size="lg"
      title={existing ? `Permisos de «${existing.name}»` : 'Nuevo rol'}
      description={existing ? 'Activa lo que este rol puede ver y hacer.' : 'Ponle un nombre y elige sus permisos.'}
      footer={
        <>
          {error && <span className="small me-auto" style={{ color: 'var(--bugie-bad)' }} role="alert">{error}</span>}
          <button type="button" className="btn btn-bugie-outline" onClick={close} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save}
                  disabled={saving || (existing ? !dirty : !name.trim())}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Guardando…</>
                    : <><i className={`fa-solid ${existing ? 'fa-floppy-disk' : 'fa-plus'} me-2`} aria-hidden="true" />{existing ? 'Guardar cambios' : 'Crear rol'}</>}
          </button>
        </>
      }
    >
      <div className="d-grid gap-4">
        <div className="bx-form-grid">
          <Field label="Nombre" required={!existing}
                 help={existing ? 'El nombre no se puede cambiar.' : 'En minúsculas, ej. soporte o finanzas.'}>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)}
                   readOnly={!!existing} placeholder="ej. soporte" />
          </Field>
          <Field label="Descripción" optional={!existing}
                 help={existing ? 'La descripción no se puede cambiar.' : '¿Qué hace este rol?'}>
            <input className="form-control" value={description} onChange={e => setDescription(e.target.value)}
                   readOnly={!!existing} placeholder="Atiende consultas de pasajeros" />
          </Field>
        </div>

        <PermsPicker catalog={catalog} selected={selected} onToggle={toggle} onSelectMany={selectMany} />
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Selector de permisos: búsqueda, filtro por tipo y categorías con Switch.
// ─────────────────────────────────────────────────────────────────────────
function PermsPicker({ catalog, selected, onToggle, onSelectMany }: {
  catalog: Catalog;
  selected: Set<string>;
  onToggle: (p: string) => void;
  onSelectMany: (perms: string[], add: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind]     = useState<'all' | 'views' | 'actions'>('all');

  const needle = search.trim().toLowerCase();
  const matchSearch = (perm: string) =>
    !needle || perm.toLowerCase().includes(needle) || (LABELS[perm] ?? '').toLowerCase().includes(needle);

  const allCatalogPerms = [...catalog.views, ...catalog.actions];
  const totalSelected = allCatalogPerms.filter(p => selected.has(p)).length;

  const buildCategories = (allPerms: string[], categories: PermCategory[]) => {
    // Lo que no encaja en ninguna categoría cae en "Otros".
    const used = new Set(categories.flatMap(c => c.perms));
    const other = allPerms.filter(p => !used.has(p));
    const all = other.length > 0 ? [...categories, { key: 'other', title: 'Otros', icon: 'fa-circle-question', perms: other }] : categories;
    return all
      .map(c => ({ ...c, perms: c.perms.filter(p => allPerms.includes(p) && matchSearch(p)) }))
      .filter(c => c.perms.length > 0);
  };

  const viewCats   = kind !== 'actions' ? buildCategories(catalog.views, VIEW_CATEGORIES) : [];
  const actionCats = kind !== 'views' ? buildCategories(catalog.actions, ACTION_CATEGORIES) : [];
  const nothing = viewCats.length === 0 && actionCats.length === 0;

  const renderCats = (cats: PermCategory[], isAction: boolean) => cats.map(cat => {
    const on = cat.perms.filter(p => selected.has(p)).length;
    return (
      <div key={cat.key} className="sa-perm-cat sa-anim">
        <div className="sa-perm-cat-head">
          <i className={`fa-solid ${cat.icon}`} aria-hidden="true" style={{ color: 'var(--bugie-primary-soft)' }} />
          <span className="t">{cat.title}</span>
          <StatusBadge size="sm" tone={on === cat.perms.length ? 'ok' : on === 0 ? 'neutral' : 'primary'}>{on}/{cat.perms.length}</StatusBadge>
          <span className="acts">
            <button type="button" className="btn btn-sm btn-link px-2 py-0" disabled={on === cat.perms.length}
                    onClick={() => onSelectMany(cat.perms, true)}>Todos</button>
            <button type="button" className="btn btn-sm btn-link px-2 py-0" disabled={on === 0}
                    onClick={() => onSelectMany(cat.perms, false)}>Ninguno</button>
          </span>
        </div>
        {cat.perms.map(p => (
          <div key={p} className="sa-perm">
            <Switch checked={selected.has(p)} onChange={() => onToggle(p)}
                    label={LABELS[p] ?? p}
                    description={<span className="sa-code">{p}{isAction ? ' · Fase 2' : ''}</span>} />
          </div>
        ))}
      </div>
    );
  });

  return (
    <div className="d-grid gap-3">
      <div className="sa-perm-tools">
        <FilterBar
          search={search} onSearchChange={setSearch} searchPlaceholder="Buscar permiso…"
          chips={[
            { value: 'all', label: 'Todos', count: allCatalogPerms.length },
            { value: 'views', label: 'Vistas del menú', count: catalog.views.length },
            ...(catalog.actions.length > 0 ? [{ value: 'actions', label: 'Acciones', count: catalog.actions.length }] : []),
          ]}
          chip={kind} onChipChange={v => setKind(v as typeof kind)}
        />
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <StatusBadge tone="primary" icon="fa-check-double">{totalSelected} de {allCatalogPerms.length} activados</StatusBadge>
          <span className="ms-auto d-flex gap-1">
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                    onClick={() => onSelectMany(allCatalogPerms, true)} disabled={totalSelected === allCatalogPerms.length}>
              Activar todo
            </button>
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                    onClick={() => onSelectMany(allCatalogPerms, false)} disabled={totalSelected === 0}>
              Quitar todo
            </button>
          </span>
        </div>
      </div>

      {viewCats.length > 0 && (
        <section className="d-grid gap-2">
          <h3 className="h6 fw-bold mb-0"><i className="fa-solid fa-eye me-2" aria-hidden="true" />Vistas del menú</h3>
          <p className="small bugie-muted mb-1">Qué módulos verá el usuario en el menú lateral.</p>
          <div>{renderCats(viewCats, false)}</div>
        </section>
      )}

      {actionCats.length > 0 && (
        <section className="d-grid gap-2">
          <h3 className="h6 fw-bold mb-0 d-flex align-items-center gap-2 flex-wrap">
            <span><i className="fa-solid fa-bolt me-2" aria-hidden="true" />Acciones</span>
            <Tooltip content="Se pueden asignar, pero todavía no limitan nada en el sistema.">
              <span tabIndex={0}><StatusBadge size="sm" tone="warn" icon="fa-clock">Fase 2</StatusBadge></span>
            </Tooltip>
          </h3>
          <p className="small bugie-muted mb-1">Definidas para uso futuro. Hoy todavía no limitan nada en el sistema.</p>
          <div>{renderCats(actionCats, true)}</div>
        </section>
      )}

      {nothing && (
        <EmptyState compact icon="fa-magnifying-glass" title="Sin resultados"
                    text={needle ? `No hay permisos que coincidan con «${search}».` : 'No hay permisos en esta vista.'} />
      )}
    </div>
  );
}
