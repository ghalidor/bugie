/* Título y descripción (SEO / redes sociales) de cada página pública.
   El título final queda como "<title> | Bugie" (salvo el inicio).
   Pueden llevar {city} / {cityCountry}: se rellenan con la ciudad
   configurada (hooks/useCity.ts). */

export interface PageMeta {
  title: string;
  description: string;
}

export const SEO: Record<string, PageMeta> = {
  home: {
    title: 'Bugie — Transporte seguro en {city}',
    description: 'Pide un viaje con conductores verificados en persona, seguimiento en tiempo real y botón SOS conectado a nuestro centro de monitoreo en {cityCountry}.',
  },
  company: {
    title: 'Empresa',
    description: 'Conoce quiénes somos, nuestra misión y por qué Bugie nace para elevar la seguridad del transporte en {city}.',
  },
  safety: {
    title: 'Seguridad',
    description: 'Cómo cuidamos cada viaje: verificación presencial de conductores, selfie al conectarse, seguimiento en tiempo real, botón SOS y Libro de Reclamaciones.',
  },
  community: {
    title: 'Comunidad',
    description: 'Noticias, novedades y comunidad de Bugie en {city}.',
  },
  earn: {
    title: 'Gana con Bugie',
    description: 'Conduce con Bugie en {city}: regístrate, verifica tus documentos en nuestra oficina y empieza a generar ingresos de forma segura.',
  },
  contact: {
    title: 'Contacto',
    description: 'Escríbenos o llámanos. El equipo de Bugie responde tus consultas sobre viajes, conductores y tu cuenta.',
  },
  faq: {
    title: 'Preguntas frecuentes',
    description: 'Resuelve tus dudas sobre viajes, pagos, seguridad y registro de conductores en Bugie.',
  },
  terms: {
    title: 'Términos y condiciones',
    description: 'Términos y condiciones de uso de la plataforma Bugie.',
  },
  privacy: {
    title: 'Política de privacidad',
    description: 'Cómo Bugie recopila, usa y protege tus datos personales.',
  },
  complaints: {
    title: 'Libro de Reclamaciones',
    description: 'Registra un reclamo o queja en el Libro de Reclamaciones virtual de Bugie y consulta su estado con tu código.',
  },
  complaintStatus: {
    title: 'Consulta de reclamo',
    description: 'Consulta el estado de tu hoja del Libro de Reclamaciones de Bugie.',
  },
};

/** Ruta pública -> clave de SEO. Las mismas rutas van en public/sitemap.xml. */
export const ROUTE_META: Record<string, string> = {
  '/':               'home',
  '/empresa':        'company',
  '/seguridad':      'safety',
  '/comunidad':      'community',
  '/gana-con-bugie': 'earn',
  '/contacto':       'contact',
  '/faq':            'faq',
  '/terminos':       'terms',
  '/privacidad':     'privacy',
};
