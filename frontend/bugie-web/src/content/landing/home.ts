/* Contenido de la página de inicio (/).
   Cada constante es el texto por defecto de una sección. Si el gestor de la
   landing tiene esa sección guardada, se usa la del gestor en su lugar
   (ver hooks/useLandingContent.ts). La clave de cada sección está al lado. */

/** Sección 'hero': portada con el teléfono de ejemplo y la banda animada. */
export const HOME_HERO = {
  title: 'Transporte seguro en {city}',
  subtitle: 'Conductores verificados, monitoreo 24/7 y botón SOS.',
  ctaPrimary: 'Solicitar viaje', ctaSecondary: 'Crear cuenta',
  pills: ['Transporte seguro', 'Monitoreo visible', 'Verificación'],
  safetyLink: 'Ver seguridad',
  stats: [
    { value: '5,000+', label: 'Conductores verificados' },
    { value: '24/7',   label: 'Monitoreo activo' },
    { value: '100%',   label: 'Seguridad como ADN' },
  ],
  phone: {
    tripLabel: 'Viaje activo', appName: 'Bugie', badge: 'Seguro',
    driverLabel: 'Conductor verificado', driverInfo: 'José M. • Toyota Yaris • ABC-123',
    etaLabel: 'Tiempo estimado', etaValue: '12 min',
    fareLabel: 'Tarifa', fareValue: 'S/ 14.20',
    safetyLabel: 'Seguridad activa', safetyDesc: 'SOS, soporte y trazabilidad', sosLabel: 'SOS',
  },
  marquee: ['Verificación diaria','Trazabilidad del viaje','Documentos y Face ID','Soporte visual','Panel gestor aislado','Responsive real'],
};

export type PhoneContent = typeof HOME_HERO.phone;

/** Sección 'features': tarjetas debajo de la portada. */
export const HOME_FEATURES = {
  eyebrow: 'Valor', title: 'Una plataforma que comunica seguridad desde la primera pantalla.',
  text: 'Cada vista está pensada para transmitir confianza antes de que el usuario siquiera suba al vehículo.',
  items: [
    { icon: 'fa-shield-halved', title: 'Seguridad operacional',  text: 'Verificación de identidad, soporte, historial y flujo SOS.' },
    { icon: 'fa-user-check',    title: 'Conductores validados',   text: 'Documentos, estados y monitoreo comunican confianza.' },
    { icon: 'fa-location-dot',  title: 'Seguimiento visible',     text: 'Trazabilidad y contexto del viaje sin saturar la pantalla.' },
    { icon: 'fa-bolt',          title: 'Solicitud simple',         text: 'Solicitar, aceptar, seguir y cerrar un viaje en pasos claros.' },
  ],
};

/** Sección 'stats': tarjetas de beneficios + métricas. */
export const HOME_STATS = {
  metricsTitle: 'Métricas',
  metrics: [
    { label: 'Viajes realizados', value: 5000, suffix: '+' },
    { label: 'Conductores',       value: 800,  suffix: '+' },
    { label: 'Confianza',         value: 98,   suffix: '%' },
    { label: 'Soporte',           value: 24,   suffix: '/7' },
  ],
  features: [
    { icon: 'fa-fingerprint',          title: 'Reconocimiento y validación', text: 'Face ID diario y controles de identidad para conductores.' },
    { icon: 'fa-location-crosshairs',  title: 'Seguimiento del servicio',    text: 'Estados, recorrido y contexto del viaje para todos los roles.' },
    { icon: 'fa-triangle-exclamation', title: 'Botón SOS',                   text: 'Acciones prioritarias y visibles para incidentes o reportes.' },
    { icon: 'fa-building-shield',      title: 'Panel operativo separado',    text: 'El gestor trabaja aparte para aislar funciones críticas.' },
  ],
};

/** Sección 'rewards': programa de puntos. */
export const HOME_REWARDS = {
  eyebrow: 'Programa de puntos',
  title: 'Cada viaje suma. Literalmente.',
  text: 'Acumula puntos en cada viaje y cámbialos por descuentos, viajes gratis y sorteos.',
  items: [
    { icon: 'fa-coins',     title: 'Ganas en cada viaje',  text: 'Los puntos se acreditan solos al completar un viaje.' },
    { icon: 'fa-medal',     title: 'Sube de nivel',        text: 'De Bronce a Platino. Más nivel, más beneficios.' },
    { icon: 'fa-gift',      title: 'Canjea lo que quieras', text: 'Descuentos, viajes gratis y tickets de sorteo.' },
    { icon: 'fa-user-plus', title: 'Invita y gana',        text: 'Comparte tu código y los dos salen ganando.' },
  ],
  ctaLabel: 'Crear mi cuenta',
  ctaHref: '/auth/registro',
  note: 'Los puntos se mantienen activos mientras sigas viajando.',
};

/** Sección 'testimonials': opiniones. `stars` es opcional (5 por defecto). */
export const HOME_TESTIMONIALS: {
  eyebrow: string; title: string;
  items: { name: string; role: string; text: string; stars?: number }[];
} = {
  eyebrow: 'Prueba social',
  title: 'La plataforma que inspira confianza desde la primera pantalla.',
  items: [
    { name: 'Camila R.', role: 'Pasajera frecuente', text: 'La interfaz transmite seguridad. Se entiende rápido quién conduce, por dónde va el viaje y dónde pedir ayuda.' },
    { name: 'Luis M.',   role: 'Conductor',          text: 'La app del conductor se siente más seria: disponibilidad, documentos, ingresos y soporte están más claros.' },
    { name: 'Operaciones', role: 'Gestión',           text: 'Separar la web pública del panel admin ayuda a validar el producto sin mezclar flujos.' },
  ],
};

/** Sección 'cta': cierre de la página. Los botones pueden traer enlace e
    icono propios desde el gestor de la landing. */
export interface CtaContent {
  eyebrow: string; title: string; text: string;
  ctaPrimary: string; ctaSecondary: string;
  ctaPrimaryHref?: string;   ctaPrimaryIcon?: string;
  ctaSecondaryHref?: string; ctaSecondaryIcon?: string;
}

export const HOME_CTA: CtaContent = {
  eyebrow: 'Siguiente paso', title: 'Empieza a movilizarte de forma segura hoy.',
  text: 'Regístrate y solicita tu primer viaje verificado.',
  ctaPrimary: 'Solicitar viaje', ctaSecondary: 'Contactar equipo',
};

/** Rutas fijas de los botones de la página (no se editan desde el gestor,
    salvo los del CTA final, que pueden traer su propio enlace). */
export const HOME_LINKS = {
  heroPrimary:   '/auth/login',
  heroSecondary: '/auth/registro',
  heroSafety:    '/seguridad',
  ctaPrimary:    '/auth/login',
  ctaSecondary:  '/contacto',
};
