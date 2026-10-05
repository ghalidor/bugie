/* Contenido del pie de página. Sección del gestor: 'footer'. */

export interface FooterLink { label: string; href: string; external?: boolean }

export const FOOTER = {
  tagline: 'Tu App de Transporte Seguro',
  description: 'Plataforma de transporte seguro con foco en identidad, trazabilidad y soporte en {cityCountry}.',
  links: [
    { label: 'Empresa',              href: '/empresa' },
    { label: 'Seguridad',            href: '/seguridad' },
    { label: 'Comunidad',            href: '/comunidad' },
    { label: 'Gana con Bugie',       href: '/gana-con-bugie' },
    { label: 'Contacto',             href: '/contacto' },
    { label: 'Preguntas frecuentes', href: '/faq' },
  ] as FooterLink[],
  productLinks: [
    { label: 'Solicitar viaje', href: '/auth/login' },
    { label: 'Crear cuenta',    href: '/auth/registro' },
    { label: 'Panel admin',     href: 'http://localhost:5174', external: true },
  ] as FooterLink[],
  contact: { email: 'hola@bugie.pe', city: '{cityCountry}', support: 'Soporte y alianzas' },
  social: [
    { name: 'instagram',   url: '#' },
    { name: 'facebook-f',  url: '#' },
    { name: 'linkedin-in', url: '#' },
  ],
  companyCol: 'Empresa', productCol: 'Producto', contactCol: 'Contacto',
  legalCol:  'Legal',
  legalLinks: {
    terms:       'Términos y condiciones',
    privacy:     'Política de privacidad',
    complaints:  'Libro de reclamaciones',
  },
  legal:    `© ${new Date().getFullYear()} Bugie. Todos los derechos reservados.`,
  legalSub: 'InteliaDevs S.A.C. · {cityCountry}',
};

/** Rutas fijas de la columna "Legal". */
export const FOOTER_LEGAL_HREFS = {
  terms:      '/terminos',
  privacy:    '/privacidad',
  complaints: '/libro-reclamaciones',
};
