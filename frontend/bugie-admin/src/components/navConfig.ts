import { PERMS } from '../state/permissions';

/// Estructura del menu lateral. La usan Sidebar (para pintar el menu) y
/// TopNav (para mostrar "Seccion › Pagina" en la barra superior).
/// Cada item exige un permiso: si el usuario no lo tiene, no se muestra,
/// y si una seccion queda vacia se oculta entera.

export interface NavItem {
  to: string;
  /** Clase FontAwesome sin prefijo. */
  icon: string;
  label: string;
  /** '' = cualquier admin (sin permiso especial). */
  permission: string;
  /** No se muestra en el menú (página a la que se llega desde otra). */
  hidden?: boolean;
}

export interface NavSection {
  key: string;
  /** null = sin titulo visible (Inicio). */
  title: string | null;
  /** Color de la seccion (distinto en cada una). */
  color: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'home',
    title: null,
    color: '#5B5BD6',
    items: [
      { to: '/admin/dashboard', icon: 'fa-gauge', label: 'Inicio', permission: PERMS.ViewDashboard },
    ],
  },
  {
    key: 'operation',
    title: 'Operación',
    color: '#0ea5e9',
    items: [
      { to: '/admin/monitoreo', icon: 'fa-map-location-dot', label: 'Monitoreo',  permission: PERMS.ViewLiveMap },
      { to: '/admin/sos',       icon: 'fa-shield-halved',    label: 'Centro SOS', permission: PERMS.ViewSosCenter },
      { to: '/admin/viajes',    icon: 'fa-route',            label: 'Viajes',     permission: PERMS.ViewTrips },
    ],
  },
  {
    key: 'people',
    title: 'Personas',
    color: '#8b5cf6',
    items: [
      { to: '/admin/pasajeros',    icon: 'fa-user',    label: 'Pasajeros',    permission: PERMS.ViewPassengers },
      { to: '/admin/conductores',  icon: 'fa-car',     label: 'Conductores',  permission: PERMS.ViewDrivers },
      { to: '/admin/verificacion', icon: 'fa-id-card', label: 'Verificación', permission: PERMS.ViewVerification },
      { to: '/admin/usuarios',     icon: 'fa-users',   label: 'Usuarios',     permission: PERMS.ViewUsers },
    ],
  },
  {
    key: 'finance',
    title: 'Finanzas',
    color: '#10b981',
    items: [
      { to: '/admin/pagos',             icon: 'fa-credit-card',          label: 'Pagos',                 permission: PERMS.ViewPayments },
      { to: '/admin/pagos-conductores', icon: 'fa-money-bill-transfer',  label: 'Pagos a conductores',   permission: PERMS.ViewDriverPayouts },
      { to: '/admin/comisiones',        icon: 'fa-scale-unbalanced',     label: 'Comisiones',            permission: PERMS.ViewCommissions },
      { to: '/admin/reportes/ranking-conductores', icon: 'fa-trophy',    label: 'Ranking de conductores', permission: PERMS.ViewReports },
    ],
  },
  {
    key: 'loyalty',
    title: 'Fidelización',
    color: '#f59e0b',
    items: [
      { to: '/admin/puntos/resumen',     icon: 'fa-chart-pie', label: 'Resumen de puntos',   permission: PERMS.ViewRewards },
      { to: '/admin/puntos/canjes',      icon: 'fa-ticket',    label: 'Canjes y soporte',    permission: PERMS.ViewRewards },
      { to: '/admin/puntos/catalogo',    icon: 'fa-gift',      label: 'Catálogo y niveles',  permission: PERMS.ViewRewards },
      { to: '/admin/puntos/promociones', icon: 'fa-bullhorn',  label: 'Promociones',         permission: PERMS.ViewRewards },
      { to: '/admin/puntos/sorteos',     icon: 'fa-dice',      label: 'Sorteos',             permission: PERMS.ViewRewards },
      { to: '/admin/puntos/ajustes',     icon: 'fa-sliders',   label: 'Ajustes de puntos',   permission: PERMS.ViewRewards },
    ],
  },
  {
    key: 'website',
    title: 'Sitio web',
    color: '#ec4899',
    items: [
      { to: '/admin/landing',   icon: 'fa-paintbrush',      label: 'Landing',              permission: PERMS.ViewLanding },
      { to: '/admin/comunidad', icon: 'fa-people-group',    label: 'Comunidad',            permission: PERMS.ViewCommunity },
      { to: '/admin/faq',       icon: 'fa-circle-question', label: 'Preguntas frecuentes', permission: PERMS.ViewFaq },
      { to: '/admin/legales',   icon: 'fa-gavel',           label: 'Documentos legales',   permission: PERMS.ViewLegalDocs },
      { to: '/admin/mensajes',  icon: 'fa-envelope',        label: 'Mensajes',             permission: PERMS.ViewMessages },
      { to: '/admin/reclamaciones', icon: 'fa-book',        label: 'Reclamaciones',        permission: PERMS.ViewComplaints },
    ],
  },
  {
    key: 'system',
    title: 'Sistema',
    color: '#64748b',
    items: [
      { to: '/admin/configuracion', icon: 'fa-gear',        label: 'Configuración',     permission: PERMS.ViewSettings },
      { to: '/admin/empresa',       icon: 'fa-building',    label: 'Datos de la empresa', permission: PERMS.ViewCompany },
      { to: '/admin/avisos',        icon: 'fa-bell',        label: 'Avisos',            permission: PERMS.ViewNotificationsConfig },
      // Historial: lo ve todo admin (el backend filtra los avisos por sus permisos).
      { to: '/admin/avisos/historial', icon: 'fa-clock-rotate-left', label: 'Historial de avisos', permission: '', hidden: true },
      { to: '/admin/seguridad',     icon: 'fa-user-shield', label: 'Seguridad y roles', permission: PERMS.ViewSecurity },
    ],
  },
];

/// Busca la seccion y el item que corresponden a una ruta (el mas especifico).
export function findNavItem(pathname: string): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.to || pathname.startsWith(item.to + '/')) {
        if (!best || item.to.length > best.item.to.length) best = { section, item };
      }
    }
  }
  return best;
}
