/* Contenido de /contacto. Sección del gestor: 'contact'. */

export const CONTACT = {
  eyebrow: 'Contacto',
  title: 'Conversemos sobre Bugie y cómo podemos ayudarte.',
  subtitle: '¿Quieres ser conductor, tienes una alianza o necesitas soporte? Escríbenos directamente.',
  formTitle: 'Escríbenos',
  successTitle: '¡Mensaje enviado!',
  successText: 'Gracias por contactarnos. Te responderemos pronto.',
  sendAnotherLabel: 'Enviar otro mensaje',
  sendLabel: 'Enviar mensaje',
  namePlaceholder: 'Tu nombre completo',
  emailPlaceholder: 'correo@ejemplo.com',
  messagePlaceholder: 'Cuéntanos qué necesitas (mínimo 10 caracteres)',
  nameLabel: 'Nombre', emailLabel: 'Correo', subjectLabel: 'Motivo', messageLabel: 'Mensaje',
  subjects: [
    { value: 'general',  label: 'Consulta general' },
    { value: 'alliance', label: 'Alianza comercial' },
    { value: 'driver',   label: 'Quiero ser conductor' },
    { value: 'support',  label: 'Soporte técnico' },
  ],
  info: [
    { icon: 'fa-location-dot', title: '{cityCountry}',    desc: 'Cobertura inicial del servicio.' },
    { icon: 'fa-envelope',     title: 'hola@bugie.pe',      desc: 'Respuesta en menos de 24 horas.' },
    { icon: 'fa-headset',      title: 'Soporte y alianzas', desc: 'Canal preparado para operaciones.' },
  ],
};

/** Textos fijos del formulario (no vienen del gestor). */
export const CONTACT_STATIC = {
  sending:      'Enviando…',
  sendError:    'Error al enviar.',
  genericError: 'No se pudo enviar. Intenta más tarde.',
};
