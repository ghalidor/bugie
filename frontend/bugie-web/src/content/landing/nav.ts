/* Menú superior de la landing (PublicTopNav). */

export const NAV_LINKS = [
  { label: 'Inicio',         href: '/' },
  { label: 'Empresa',        href: '/empresa' },
  { label: 'Seguridad',      href: '/seguridad' },
  { label: 'Comunidad',      href: '/comunidad' },
  { label: 'Gana con Bugie', href: '/gana-con-bugie' },
  { label: 'Contacto',       href: '/contacto' },
];

/** Idiomas del selector: nombre largo (desktop) y corto (menú móvil). */
export const NAV_LANGUAGES = [
  { code: 'es', label: '🇵🇪 Español',   short: '🇵🇪 ES' },
  { code: 'en', label: '🇺🇸 English',   short: '🇺🇸 EN' },
  { code: 'pt', label: '🇧🇷 Português', short: '🇧🇷 PT' },
];

export const NAV_TEXT = {
  chip:       'Transporte seguro',
  login:      'Ingresar',
  register:   'Crear cuenta',
  adminLabel: 'Acceso panel administrativo',
  adminHref:  'http://localhost:5174/auth/login',
};
