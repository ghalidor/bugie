/* Contenido de /gana-con-bugie. Sección del gestor: 'earn'. */

export const EARN = {
  eyebrow: 'Gana con Bugie',
  title: 'Convierte tu vehículo en una fuente de ingresos.',
  subtitle: 'Únete a la red de conductores verificados de {city}. Sin cuotas mensuales, sin contratos, tú eliges cuándo trabajar.',
  ctaPrimary: 'Quiero ser conductor',
  ctaSecondary: 'Ya tengo cuenta',
  benefits: [
    { icon: 'fa-coins',         title: 'Ingresos por viaje',     text: 'Recibes el monto del viaje menos una comisión transparente del 10%. Sin cobros ocultos.' },
    { icon: 'fa-clock',         title: 'Tú decides tu horario',  text: 'Conéctate cuando quieras, desconéctate cuando lo necesites. Sin metas obligatorias.' },
    { icon: 'fa-shield-halved', title: 'Pasajeros verificados',  text: 'Todos los pasajeros están registrados con cuenta verificada en la plataforma.' },
    { icon: 'fa-wallet',        title: 'Cobros por Yape o Plin', text: 'Recibe tus pagos directamente. Retira tu billetera cuando quieras.' },
    { icon: 'fa-headset',       title: 'Soporte 24/7',           text: 'Equipo de monitoreo disponible para emergencias y soporte operativo.' },
    { icon: 'fa-route',         title: 'Rutas optimizadas',      text: 'Recibe solicitudes cercanas a tu ubicación con tarifa estimada antes de aceptar.' },
  ],
  requirementsTitle: 'Requisitos para registrarte',
  requirements: [
    'DNI vigente',
    'Licencia de conducir A-IIa o superior',
    'SOAT vigente',
    'Vehículo en buenas condiciones (modelo 2010 o más reciente)',
    'Certificado de antecedentes penales',
    'Disponibilidad para verificación presencial',
  ],
  stepsTitle: '¿Cómo empiezas?',
  steps: [
    { num: 1, title: 'Regístrate',         text: 'Completa el formulario con tus datos básicos.' },
    { num: 2, title: 'Sube tus documentos', text: 'DNI, licencia, SOAT y antecedentes desde la app.' },
    { num: 3, title: 'Verificación',        text: 'Validamos tus documentos en 24 a 48 horas.' },
    { num: 4, title: 'Empieza a ganar',     text: 'Activa tu disponibilidad y recibe tu primer viaje.' },
  ],
  finalCtaTitle: '¿Listo para empezar?',
  finalCtaText:  'El registro es gratuito y toma menos de 3 minutos.',
  finalCtaButton: 'Crear cuenta de conductor',
};

/** Textos y rutas fijas de la página (no vienen del gestor). */
export const EARN_STATIC = {
  benefitsTitle: 'Por qué conducir con Bugie',
  registerHref:  '/auth/registro-conductor',
  loginHref:     '/auth/login',
};
