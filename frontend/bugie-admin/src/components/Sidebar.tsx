import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { usePermissions, PERMS } from '../state/permissions';

/// Sidebar del admin con secciones colapsables individuales.
///
/// Comportamiento:
///   - Cada sección (Operaciones, Gestión, Contenido, Sistema) tiene su chevron y
///     puede colapsarse/expandirse de forma independiente.
///   - Si una sección contiene la ruta actual, se abre automáticamente.
///   - El estado de cada sección se persiste en localStorage entre sesiones.
///   - Si el sidebar completo está en modo colapsado (icon-only), las
///     secciones se ignoran y se muestran todos los íconos centrados con
///     un divisor entre secciones.
///   - **Cada NavItem tiene un `permission` requerido. Solo se muestra si el
///     usuario lo tiene. Si toda una sección quedó vacía, se oculta entera.**

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

interface NavItem {
  to: string;
  iconClass: string;
  label: string;
  permission: string;  // Permiso requerido para ver este item
}

interface NavSection {
  key:      string;
  title:    string;
  color:    string;
  icon:     string;
  items:    NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    key: 'operations',
    title: 'Operaciones',
    color: '#38bdf8',
    icon: 'fa-bolt',
    items: [
      { to: '/admin/dashboard', iconClass: 'fa-solid fa-gauge',            label: 'Dashboard', permission: PERMS.ViewDashboard },
      { to: '/admin/monitoreo', iconClass: 'fa-solid fa-map-location-dot', label: 'Monitoreo', permission: PERMS.ViewLiveMap   },
      { to: '/admin/sos',       iconClass: 'fa-solid fa-shield-halved',    label: 'Centro SOS',permission: PERMS.ViewSosCenter },
    ],
  },
  {
    key: 'management',
    title: 'Gestión',
    color: '#818cf8',
    icon: 'fa-briefcase',
    items: [
      { to: '/admin/usuarios',     iconClass: 'fa-solid fa-users',         label: 'Usuarios',     permission: PERMS.ViewUsers       },
      { to: '/admin/pasajeros',    iconClass: 'fa-solid fa-user',          label: 'Pasajeros',    permission: PERMS.ViewPassengers  },
      { to: '/admin/conductores',  iconClass: 'fa-solid fa-car',           label: 'Conductores',  permission: PERMS.ViewDrivers     },
      { to: '/admin/verificacion', iconClass: 'fa-solid fa-id-card',       label: 'Verificación', permission: PERMS.ViewDrivers     },
      { to: '/admin/viajes',       iconClass: 'fa-solid fa-route',         label: 'Viajes',       permission: PERMS.ViewTrips       },
      { to: '/admin/pagos',        iconClass: 'fa-solid fa-credit-card',   label: 'Pagos',        permission: PERMS.ViewPayments    },
      { to: '/admin/pagos-conductores', iconClass: 'fa-solid fa-money-bill-transfer', label: 'Pagos a conductores', permission: PERMS.ViewPayments },
    ],
  },
  {
    key: 'loyalty',
    title: 'Fidelización',
    color: '#f5b400',
    icon: 'fa-star',
    items: [
      // Reutiliza view:payments para no tocar Permissions.cs de Auth.
      // Si mas adelante se crea view:rewards, basta con cambiarlo aqui.
      { to: '/admin/puntos', iconClass: 'fa-solid fa-star', label: 'Puntos y recompensas', permission: PERMS.ViewPayments },
    ],
  },
  {
    key: 'content',
    title: 'Contenido',
    color: '#f59e0b',
    icon: 'fa-palette',
    items: [
      { to: '/admin/landing',       iconClass: 'fa-solid fa-paintbrush',   label: 'Landing',             permission: PERMS.ViewLanding    },
      { to: '/admin/comunidad',     iconClass: 'fa-solid fa-people-group', label: 'Comunidad',           permission: PERMS.ViewCommunity  },
      { to: '/admin/faq',           iconClass: 'fa-solid fa-circle-question', label: 'Preguntas frecuentes', permission: PERMS.ViewFaq    },
      { to: '/admin/legales',       iconClass: 'fa-solid fa-gavel',        label: 'Documentos legales',  permission: PERMS.ViewLegalDocs  },
      { to: '/admin/configuracion', iconClass: 'fa-solid fa-gear',         label: 'Configuración',       permission: PERMS.ViewLanding    },
    ],
  },
  {
    key: 'messages',
    title: 'Comunicación',
    color: '#f59e0b',
    icon: 'fa-envelope',
    items: [
      { to: '/admin/mensajes', iconClass: 'fa-solid fa-envelope', label: 'Mensajes de contacto', permission: PERMS.ViewLanding },
    ],
  },
  {
    key: 'reports',
    title: 'Reportes',
    color: '#10b981',
    icon: 'fa-chart-line',
    items: [
      { to: '/admin/reportes/ranking-conductores', iconClass: 'fa-solid fa-trophy', label: 'Ranking conductores', permission: PERMS.ViewReports },
    ],
  },
  {
    key: 'system',
    title: 'Sistema',
    color: '#ef4444',
    icon: 'fa-lock',
    items: [
      { to: '/admin/seguridad', iconClass: 'fa-solid fa-user-shield', label: 'Seguridad', permission: PERMS.ViewSecurity },
    ],
  },
];

const LS_KEY = 'bugie_sidebar_sections';

/// Lee el estado de cada sección desde localStorage (qué está abierto).
/// Si no hay nada guardado, todas inician abiertas.
function loadSectionState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { operations: true, management: true, loyalty: true, content: true, system: true };
}

function saveSectionState(state: Record<string, boolean>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

/// Item del sidebar.
function Item({ item, color, collapsed }: { item: NavItem; color: string; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => `bugie-nav-item ${isActive ? 'is-active' : ''}`}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : '0.85rem',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '0.7rem 0' : '0.55rem 0.85rem',
        marginLeft: collapsed ? 0 : '0.5rem',
        borderRadius: 10,
        borderLeft: !collapsed && isActive ? `3px solid ${color}` : '3px solid transparent',
        background: isActive
          ? `linear-gradient(90deg, ${color}22, ${color}05)`
          : 'transparent',
        color: isActive ? color : 'var(--bugie-text)',
        fontWeight: 600,
        fontSize: '0.85rem',
        textDecoration: 'none',
        transition: 'all .15s ease',
        opacity: isActive ? 1 : 0.78,
      })}
    >
      <i
        className={item.iconClass}
        style={{
          fontSize: collapsed ? '1.1rem' : '0.95rem',
          width: 20,
          textAlign: 'center',
        }}
      />
      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed: ctrlCollapsed, onToggle }: SidebarProps = {}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = ctrlCollapsed ?? internalCollapsed;
  const toggle = onToggle ?? (() => setInternalCollapsed(v => !v));

  /// Permisos efectivos del usuario actual. Filtran qué items y secciones se muestran.
  const { has, loading: permsLoading } = usePermissions();

  /// Estado de apertura/cierre de cada sección (independiente).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(loadSectionState);

  /// Filtramos las secciones: ítem se muestra si el user tiene el permiso;
  /// sección entera se oculta si quedó sin ítems visibles.
  /// Mientras los permisos cargan, mostramos lista vacía para evitar el flash
  /// de ver todo el menú y después que desaparezcan ítems.
  const visibleSections = permsLoading
    ? []
    : SECTIONS
        .map(s => ({ ...s, items: s.items.filter(it => has(it.permission)) }))
        .filter(s => s.items.length > 0);

  /// Cuando cambia la ruta actual, expandir automáticamente la sección que
  /// contiene esa ruta (si estaba cerrada). Así el admin siempre ve el item
  /// activo sin tener que abrir la sección manualmente.
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const target = visibleSections.find(s => s.items.some(it => path.startsWith(it.to)));
    if (target && !openSections[target.key]) {
      setOpenSections(prev => {
        const next = { ...prev, [target.key]: true };
        saveSectionState(next);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveSectionState(next);
      return next;
    });
  }

  return (
    <>
      <style>{`
        .bugie-nav-item:not(.is-active):hover {
          background: rgba(255,255,255,0.05) !important;
          opacity: 1 !important;
        }
        body[data-theme='light'] .bugie-nav-item:not(.is-active):hover {
          background: rgba(0,0,0,0.04) !important;
        }
        .bugie-section-header:hover {
          background: rgba(255,255,255,0.04);
        }
        body[data-theme='light'] .bugie-section-header:hover {
          background: rgba(0,0,0,0.03);
        }
        @keyframes sectionFade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .bugie-section-items {
          animation: sectionFade .15s ease;
        }
      `}</style>

      <div style={{ padding: collapsed ? '0.5rem 0.4rem' : '0.75rem 0.5rem' }}>

        {/* Botón toggle colapsar/expandir el sidebar completo */}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '0.5rem 0' : '0.5rem 0.85rem',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            borderRadius: 10,
            marginBottom: '0.5rem',
          }}
        >
          {!collapsed && <span>MENÚ</span>}
          <i className={`fa-solid ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
        </button>

        {visibleSections.map((section, idx) => {
          const open = collapsed ? true : (openSections[section.key] ?? true);

          return (
            <div key={section.key} style={{ marginTop: idx === 0 ? 0 : '0.5rem' }}>

              {/* Header de sección — clickeable cuando NO está colapsado */}
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="bugie-section-header"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0.55rem 0.85rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 8,
                    transition: 'background .15s',
                    textAlign: 'left',
                  }}
                  aria-expanded={open}
                  title={open ? 'Colapsar sección' : 'Expandir sección'}
                >
                  {/* Ícono coloreado dentro de "chip" del color */}
                  <span style={{
                    width: 26, height: 26,
                    borderRadius: 7,
                    background: section.color + '22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <i className={`fa-solid ${section.icon}`}
                       style={{ color: section.color, fontSize: '0.78rem' }} />
                  </span>

                  {/* Título de la sección */}
                  <span style={{
                    flex: 1,
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: section.color,
                    fontWeight: 700,
                    opacity: 0.95,
                  }}>
                    {section.title}
                  </span>

                  {/* Contador de items */}
                  <span style={{
                    fontSize: '0.68rem',
                    color: '#94a3b8',
                    fontWeight: 600,
                    marginRight: 4,
                  }}>
                    {section.items.length}
                  </span>

                  {/* Chevron de open/close */}
                  <i
                    className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`}
                    style={{
                      fontSize: '0.7rem',
                      color: '#94a3b8',
                      transition: 'transform .2s',
                    }}
                  />
                </button>
              ) : (
                // Sidebar colapsado: solo divisores entre secciones
                idx > 0 && (
                  <div style={{
                    height: 1,
                    background: 'var(--bugie-border)',
                    margin: '0.5rem 0.4rem',
                    opacity: 0.5,
                  }} />
                )
              )}

              {/* Items de la sección (con animación de fade-in al abrir) */}
              {open && (
                <div
                  className={!collapsed ? 'bugie-section-items' : ''}
                  style={{
                    display: 'grid',
                    gap: 2,
                    marginTop: !collapsed ? 4 : 0,
                  }}
                >
                  {section.items.map(it => (
                    <Item key={it.to} item={it} color={section.color} collapsed={collapsed} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
