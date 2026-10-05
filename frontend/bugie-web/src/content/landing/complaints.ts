/* Contenido del Libro de Reclamaciones (/libro-reclamaciones), formato Indecopi.
   Razón social, RUC, dirección y logo vienen de "Datos de la empresa"
   (hook useCompany); aquí solo quedan los textos fijos y el respaldo. */

export interface ComplaintField {
  key: string;
  label: string;
  /** Columnas de Bootstrap que ocupa el campo. */
  col: 'col-12' | 'col-md-6' | 'col-md-4' | 'col-md-8';
  required?: boolean;
  type?: 'email' | 'number' | 'tel';
  step?: string;
  maxLength?: number;
  /** Si viene, el campo es un textarea con esa cantidad de filas. */
  rows?: number;
}

export interface ComplaintChoice {
  /** Nombre del grupo de radios (y clave en el formulario). */
  name: string;
  options: { value: string; label: string; note?: string }[];
}

export const COMPLAINTS = {
  title: 'Libro de Reclamaciones',
  sheetTitle: 'Hoja de Reclamación',
  sheetNumberPending: 'N° se asigna al enviar',
  dateLabel: 'Fecha',
  rucLabel: 'RUC',
  brand: 'Bugie',
  /** Respaldo si "Datos de la empresa" no responde (texto de siempre). */
  company: 'InteliaDevs S.A.C.',
  /** Respaldo de la dirección: {cityCountry} se rellena con la ciudad configurada. */
  city: '{cityCountry}',
  submitLabel: 'Enviar',
  sending: 'Enviando…',
  sendError: 'No pudimos registrar tu reclamación. Revisa tu conexión e inténtalo de nuevo.',
  emailMismatch: 'Los correos no coinciden.',
  // Viaje o envío relacionado (en el formato de Indecopi es el "Local")
  tripLabel: 'Viaje o envío relacionado',
  tripHelp: 'Opcional. Escribe el código del viaje o envío (lo ves en tu historial).',
  tripSelectEmpty: 'Ninguno',
  tripSelectOther: 'Otro (escribir el código)',
  tripCodeLabel: 'Código del viaje o envío',
  minorLabel: 'Soy menor de edad',
  guardianLabel: 'Nombre del padre, madre o apoderado *',
  // Éxito
  successTitle: '¡Tu reclamación fue registrada!',
  successNumber: 'Número de hoja',
  successEmail: (email: string) => `Te enviamos una copia de tu hoja de reclamación a ${email}. Ahí también recibirás nuestra respuesta.`,
  successNoEmail: 'Tu hoja quedó registrada, pero no pudimos enviarte la copia por correo. Guarda este número y el enlace de consulta.',
  successDue: (date: string) => `Te responderemos a más tardar el ${date}.`,
  successConsult: 'Ver mi hoja de reclamación',
  successNew: 'Registrar otra reclamación',
};

export const DOC_TYPES = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE',  label: 'CE' },
];

/** 1. Identificación del consumidor reclamante. */
export const CONSUMER_TITLE = '1. Identificación del consumidor reclamante';
export const CONSUMER_FIELDS: ComplaintField[] = [
  { key: 'consumerName',    label: 'Nombre completo *', col: 'col-12', required: true, maxLength: 150 },
  { key: 'consumerAddress', label: 'Domicilio *',       col: 'col-12', required: true, maxLength: 250 },
];
export const CONSUMER_CONTACT_FIELDS: ComplaintField[] = [
  { key: 'phone',        label: 'Teléfono *',         col: 'col-md-4', required: true, type: 'tel', maxLength: 20 },
  { key: 'email',        label: 'E-mail * (3)',       col: 'col-md-6', required: true, type: 'email', maxLength: 150 },
  { key: 'emailConfirm', label: 'Confirmar e-mail *', col: 'col-md-6', required: true, type: 'email', maxLength: 150 },
];

/** 2. Identificación del bien contratado. */
export const GOOD_TITLE = '2. Identificación del bien contratado *';
export const GOOD_CHOICE: ComplaintChoice = {
  name: 'goodType',
  options: [
    { value: 'producto', label: 'Producto' },
    { value: 'servicio', label: 'Servicio' },
  ],
};
export const GOOD_FIELDS: ComplaintField[] = [
  { key: 'claimedAmount',   label: 'Monto reclamado (S/)', col: 'col-md-4', type: 'number', step: '0.01' },
  { key: 'goodDescription', label: 'Descripción',          col: 'col-md-8', maxLength: 500 },
];

/** 3. Detalle de la reclamación. */
export const DETAIL_TITLE = '3. Detalle de la reclamación';
export const DETAIL_CHOICE: ComplaintChoice = {
  name: 'complaintType',
  options: [
    { value: 'reclamo', label: 'Reclamo', note: '1' },
    { value: 'queja',   label: 'Queja',   note: '2' },
  ],
};
export const DETAIL_FIELDS: ComplaintField[] = [
  { key: 'reference', label: 'Referencia',  col: 'col-12', maxLength: 200 },
  { key: 'detail',    label: 'Detalle *',   col: 'col-12', required: true, rows: 5, maxLength: 4000 },
  { key: 'request',   label: 'Pedido *',    col: 'col-12', required: true, rows: 4, maxLength: 2000 },
];

/** Notas legales numeradas que van debajo del formulario. */
export const COMPLAINT_NOTES = [
  { num: '1', term: 'Reclamo:', text: 'disconformidad relacionada a los productos o servicios.' },
  { num: '2', term: 'Queja:',   text: 'disconformidad no relacionada a los productos o servicios, malestar respecto a la atención al público.' },
  { num: '3', term: 'E-mail:',  text: 'al brindar mi correo electrónico, autorizo recibir la respuesta a través de este medio.' },
];

/** Plazo de respaldo si "Datos de la empresa" no responde (el vigente viene de la configuración). */
export const DEFAULT_RESPONSE_DAYS = 15;

const UP_TO_29 = [
  'cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** Número en letras delante de un sustantivo masculino ("un", "veintiún"). 0..999; fuera de rango, la cifra. */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 30) return UP_TO_29[n];
  if (n < 100) return n % 10 === 0 ? TENS[n / 10 | 0] : `${TENS[n / 10 | 0]} y ${UP_TO_29[n % 10]}`;
  if (n === 100) return 'cien';
  return n % 100 === 0 ? HUNDREDS[n / 100 | 0] : `${HUNDREDS[n / 100 | 0]} ${numberWords(n % 100)}`;
}

/** "quince (15) días hábiles" / "un (1) día hábil". */
export function businessDaysText(n: number): string {
  return `${numberWords(n)} (${n}) ${n === 1 ? 'día hábil' : 'días hábiles'}`;
}

/** Reglas legales bajo el formulario, con el plazo de la hoja (o el vigente). */
export function complaintRules(responseDays: number): string[] {
  return [
    'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante INDECOPI.',
    `El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor de ${businessDaysText(responseDays)}, improrrogable.`,
  ];
}

/** Página de consulta (/libro-reclamaciones/consulta/:code?t=token). */
export const COMPLAINT_STATUS = {
  loading: 'Cargando tu hoja de reclamación…',
  notFound: 'No encontramos la reclamación. Revisa el enlace de tu correo.',
  statusLabel: 'Estado',
  pending: 'Pendiente de respuesta',
  answered: 'Respondida',
  voided: 'Anulada',
  voidedAt: 'Anulada el',
  voidedText: 'Esta hoja de reclamación fue anulada y no tendrá respuesta. Si tienes dudas, escríbenos a nuestros canales de atención.',
  termLabel: 'Plazo de respuesta',
  dueLabel: 'Fecha límite de respuesta',
  responseTitle: 'Respuesta de la empresa',
  respondedAt: 'Respondida el',
  noResponse: 'Aún no hay respuesta. Te avisaremos a tu correo.',
  backToBook: 'Ir al Libro de Reclamaciones',
};

/** "dd/mm/aaaa" de una fecha de la API (hora de Perú sin zona) o "aaaa-mm-dd". */
export function fmtDay(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
}

/** "dd/mm/aaaa hh:mm" de una fecha de la API (hora de Perú sin zona). */
export function fmtDateTime(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtDay(iso);
}
