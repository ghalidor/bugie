/* ──────────────────────────────────────────────────────────────────────────
   Metadatos del gestor de landing.

   FIELDS nombra en español TODOS los campos que existen hoy en el contenido
   (se revisaron uno por uno contra la base). Cada uno lleva, además del
   nombre, una ayuda que dice DÓNDE aparece ese texto en la página, que es la
   pregunta que uno se hace al editar.

   Si mañana aparece un campo nuevo que no esté acá, igual se puede editar:
   se muestra con su nombre técnico legible. Nada queda invisible.
   ────────────────────────────────────────────────────────────────────────── */

export interface SectionMeta {
  key:    string;
  label:  string;
  icon:   string;
  group:  'home' | 'pages' | 'global' | 'auth';
  /** Dónde se ve esta sección, en palabras de quien edita. */
  where:  string;
  /**
   * true cuando el sitio público NO lee esta sección. Se marca en la tarjeta
   * para que nadie pierda tiempo editando algo que no se ve en ningún lado.
   * Comprobado leyendo el código de bugie-web.
   */
  unused?: boolean;
}

export const SECTIONS: SectionMeta[] = [
  { key: 'hero',          label: 'Portada',             icon: 'fa-star',            group: 'home',
    where: 'Lo primero que se ve al entrar al sitio' },
  { key: 'features',      label: 'Características',     icon: 'fa-table-cells-large', group: 'home',
    where: 'Bloque de tarjetas debajo de la portada' },
  { key: 'stats',         label: 'Cifras y beneficios', icon: 'fa-chart-simple',    group: 'home',
    where: 'Bloque de números y beneficios' },
  { key: 'rewards',       label: 'Programa de puntos',  icon: 'fa-coins',           group: 'home',
    where: 'Bloque del programa de fidelización, entre las cifras y los testimonios' },
  { key: 'testimonials',  label: 'Testimonios',         icon: 'fa-comments',        group: 'home',
    where: 'Opiniones de pasajeros y conductores' },
  { key: 'cta',           label: 'Llamado a la acción', icon: 'fa-bullhorn',        group: 'home',
    where: 'Bloque final de la página principal' },

  { key: 'company',       label: 'Empresa',             icon: 'fa-building',        group: 'pages',
    where: 'Página /empresa' },
  { key: 'safety',        label: 'Seguridad',           icon: 'fa-shield-halved',   group: 'pages',
    where: 'Página /seguridad' },
  { key: 'contact',       label: 'Contacto',            icon: 'fa-envelope',        group: 'pages',
    where: 'Página /contacto, incluido el formulario' },
  { key: 'news',          label: 'Noticias',            icon: 'fa-newspaper',       group: 'pages',
    where: 'Encabezado de la página de comunidad', unused: true },

  { key: 'navbar',        label: 'Barra superior',      icon: 'fa-bars',            group: 'global',
    where: 'Menú de arriba, en todas las páginas', unused: true },
  { key: 'footer',        label: 'Pie de página',       icon: 'fa-grip-lines',      group: 'global',
    where: 'Al final de todas las páginas' },

  { key: 'auth',          label: 'Panel de bienvenida', icon: 'fa-image',           group: 'auth',
    where: 'Columna decorativa al costado del login' },
  { key: 'auth_login',    label: 'Inicio de sesión',    icon: 'fa-right-to-bracket', group: 'auth',
    where: 'Formulario de ingreso' },
  { key: 'auth_register', label: 'Registro',            icon: 'fa-user-plus',       group: 'auth',
    where: 'Formulario de creación de cuenta' },
];

/*
 * Fuera de la lista a propósito:
 *   terms y privacy  -> se editan en Documentos Legales, con editor de texto.
 *   how-it-works     -> existe como fila en landing.sections pero sin contenido
 *                       en ningún idioma, y la web no la lee en ninguna parte.
 *                       Es una fila huérfana: si quieres, se borra con
 *                       DELETE FROM landing.sections WHERE sectionkey = 'how-it-works';
 */
export const EXCLUDED = ['terms', 'privacy'];

export const GROUPS = [
  { key: 'home',   label: 'Página principal', icon: 'fa-house' },
  { key: 'pages',  label: 'Páginas internas', icon: 'fa-file-lines' },
  { key: 'global', label: 'Global',           icon: 'fa-globe' },
  { key: 'auth',   label: 'Entrar y registrarse', icon: 'fa-lock' },
] as const;

export interface FieldMeta {
  label: string;
  /** Dónde aparece. Se muestra debajo del campo. */
  help?: string;
  /** Largo recomendado. Avisa, no bloquea. */
  max?: number;
  /** Fuerza caja grande. */
  long?: boolean;
}

export const FIELDS: Record<string, FieldMeta> = {
  // ── Encabezados, presentes en casi todas las secciones ──────────────
  eyebrow:      { label: 'Antetítulo',  help: 'Texto pequeño encima del título.', max: 30 },
  title:        { label: 'Título',      help: 'El texto grande de la sección.', max: 70 },
  subtitle:     { label: 'Subtítulo',   help: 'Frase debajo del título.', max: 160, long: true },
  text:         { label: 'Texto',       help: 'Párrafo de la sección.', long: true },
  description:  { label: 'Descripción', help: 'Párrafo descriptivo.', long: true },

  // ── Botones ─────────────────────────────────────────────────────────
  ctaPrimary:       { label: 'Botón principal',          help: 'La acción más importante.', max: 24 },
  ctaPrimaryHref:   { label: 'Enlace del botón principal',  help: 'A dónde lleva. Ejemplo: /auth/registro' },
  ctaPrimaryIcon:   { label: 'Ícono del botón principal',   help: 'Nombre de Font Awesome. Ejemplo: fa-car' },
  ctaSecondary:     { label: 'Botón secundario',         help: 'La alternativa.', max: 24 },
  ctaSecondaryHref: { label: 'Enlace del botón secundario' },
  ctaSecondaryIcon: { label: 'Ícono del botón secundario' },

  // ── Portada ─────────────────────────────────────────────────────────
  pills:    { label: 'Insignias',  help: 'Las píldoras que rodean el título de la portada.' },
  marquee:  { label: 'Cinta deslizante', help: 'Textos que se desplazan de lado a lado.' },
  phone:    { label: 'Teléfono del móvil', help: 'Texto que se ve en la maqueta del celular.' },

  // ── Cifras ──────────────────────────────────────────────────────────
  metricsTitle: { label: 'Título de los beneficios', help: 'Encabezado del bloque de beneficios.' },
  metrics:      { label: 'Beneficios',  help: 'Cada tarjeta de beneficio.' },
  stats:        { label: 'Cifras',      help: 'Los números grandes, por ejemplo 5,000+ conductores.' },
  features:     { label: 'Tarjetas',    help: 'Cada tarjeta con ícono, título y descripción.' },
  items:        { label: 'Elementos',   help: 'Cada tarjeta de la lista.' },

  // ── Programa de puntos ──────────────────────────────────────────────
  ctaLabel: { label: 'Texto del botón',
              help: 'Por ejemplo «Crear mi cuenta».' },
  ctaHref:  { label: 'Enlace del botón',
              help: 'A dónde lleva. Por defecto /auth/registro.' },
  note:     { label: 'Nota bajo el botón',
              help: 'Línea pequeña en gris. Si la dejas vacía no se muestra.' },

  // ── Empresa ─────────────────────────────────────────────────────────
  missionTitle:  { label: 'Título de la misión' },
  mission:       { label: 'Misión',  long: true },
  visionTitle:   { label: 'Título de la visión' },
  vision:        { label: 'Visión',  long: true },
  problemsTitle: { label: 'Título de los problemas' },
  problems:      { label: 'Problemas', help: 'Los problemas que resuelve Bugie.' },
  teamTitle:     { label: 'Título del equipo' },
  team:          { label: 'Equipo',    help: 'Cada integrante con su nombre y cargo.' },

  // ── Seguridad ───────────────────────────────────────────────────────
  mapLabel: { label: 'Texto del mapa', help: 'Leyenda sobre el mapa de zonas.' },

  // ── Contacto ────────────────────────────────────────────────────────
  formTitle:        { label: 'Título del formulario' },
  info:             { label: 'Datos de contacto', help: 'Tarjetas con teléfono, correo, dirección.' },
  subjects:         { label: 'Asuntos', help: 'Opciones del desplegable «asunto».' },
  nameLabel:        { label: 'Etiqueta del campo Nombre' },
  namePlaceholder:  { label: 'Ejemplo del campo Nombre', help: 'Texto gris dentro del campo vacío.' },
  messageLabel:     { label: 'Etiqueta del campo Mensaje' },
  messagePlaceholder:{ label: 'Ejemplo del campo Mensaje' },
  subjectLabel:     { label: 'Etiqueta del campo Asunto' },
  sendLabel:        { label: 'Texto del botón Enviar', max: 24 },
  sendAnotherLabel: { label: 'Texto del botón Enviar otro' },
  successTitle:     { label: 'Título al enviar bien' },
  successText:      { label: 'Mensaje al enviar bien', long: true },

  // ── Noticias ────────────────────────────────────────────────────────
  emptyText: { label: 'Texto cuando no hay noticias', help: 'Se ve solo si no hay artículos publicados.' },

  // ── Barra superior y pie ────────────────────────────────────────────
  links:        { label: 'Enlaces del menú' },
  productLinks: { label: 'Enlaces de Producto', help: 'Segunda columna de enlaces del pie.' },
  social:       { label: 'Redes sociales' },
  tagline:      { label: 'Lema bajo el logo', help: 'Frase corta debajo del logo, en el pie.', max: 50 },
  companyCol:   { label: 'Título de la columna Empresa', help: 'Encabezado de la primera columna de enlaces.' },
  productCol:   { label: 'Título de la columna Producto' },
  contactCol:   { label: 'Título de la columna Contacto' },
  contact:      { label: 'Encabezado de contacto' },
  support:      { label: 'Texto de soporte' },
  email:        { label: 'Correo de contacto' },
  city:         { label: 'Ciudad' },
  legal:        { label: 'Aviso legal', help: 'Línea de copyright al final.' },
  legalSub:     { label: 'Segunda línea legal' },

  // ── Entrar y registrarse ────────────────────────────────────────────
  chipLabel:            { label: 'Etiqueta del panel' },
  chips:                { label: 'Insignias del panel' },
  emailLabel:           { label: 'Etiqueta del campo Correo' },
  emailPlaceholder:     { label: 'Ejemplo del campo Correo' },
  passwordLabel:        { label: 'Etiqueta del campo Contraseña' },
  passwordPlaceholder:  { label: 'Ejemplo del campo Contraseña' },
  firstNameLabel:       { label: 'Etiqueta del campo Nombre' },
  firstNamePlaceholder: { label: 'Ejemplo del campo Nombre' },
  lastNameLabel:        { label: 'Etiqueta del campo Apellido' },
  lastNamePlaceholder:  { label: 'Ejemplo del campo Apellido' },
  phoneLabel:           { label: 'Etiqueta del campo Teléfono' },
  phonePlaceholder:     { label: 'Ejemplo del campo Teléfono' },
  roleLabel:            { label: 'Etiqueta del tipo de cuenta' },
  roles:                { label: 'Tipos de cuenta', help: 'Pasajero, conductor…' },
  rememberLabel:        { label: 'Texto de «recordarme»' },
  forgotLabel:          { label: 'Texto de «olvidé mi contraseña»' },
  noAccountLabel:       { label: 'Texto de «no tengo cuenta»' },
  hasAccountLabel:      { label: 'Texto de «ya tengo cuenta»' },
  registerLabel:        { label: 'Texto del enlace a Registro', max: 24 },
  loginLabel:           { label: 'Texto del enlace a Ingresar', max: 24 },
  submitLabel:          { label: 'Texto del botón', max: 24 },
  loadingLabel:         { label: 'Texto mientras carga', max: 24 },

  // ── Documentos legales (no se editan acá, pero por si acaso) ────────
  html:         { label: 'Contenido', long: true },
  updatedAt:    { label: 'Fecha de actualización' },
  updatedLabel: { label: 'Texto de «actualizado el»' },

  // ── Campos DENTRO de las listas ─────────────────────────────────────
  label:     { label: 'Etiqueta',    max: 45 },
  value:     { label: 'Valor',       help: 'El número o texto destacado.', max: 14 },
  suffix:    { label: 'Sufijo',      help: 'Lo que va después del número. Ejemplo: +, %, k', max: 6 },
  icon:      { label: 'Ícono',       help: 'Nombre de Font Awesome. Ejemplo: fa-shield-halved' },
  iconClass: { label: 'Ícono',       help: 'Clase completa de Font Awesome.' },
  href:      { label: 'Enlace',      help: 'A dónde lleva. Ejemplo: /seguridad' },
  url:       { label: 'Dirección',   help: 'Dirección completa, con https://' },
  external:  { label: '¿Abre en otra pestaña?' },
  name:      { label: 'Nombre' },
  role:      { label: 'Cargo' },
  desc:      { label: 'Descripción', long: true },
  stars:     { label: 'Estrellas',   help: 'Puntuación del 1 al 5.', max: 2 },
};

/** Devuelve el nombre y la ayuda de un campo. Nunca falla. */
export function fieldMeta(key: string): FieldMeta {
  if (FIELDS[key]) return FIELDS[key];

  // Los campos terminados en Placeholder y Label siguen un patrón conocido.
  if (key.endsWith('Placeholder')) {
    const base = key.slice(0, -'Placeholder'.length);
    return { label: `Ejemplo del campo ${humanize(base)}`,
             help: 'Texto gris que se ve dentro del campo vacío.' };
  }
  if (key.endsWith('Label')) {
    return { label: `Etiqueta del campo ${humanize(key.slice(0, -'Label'.length))}` };
  }
  if (key.endsWith('Title')) {
    return { label: `Título de ${humanize(key.slice(0, -'Title'.length)).toLowerCase()}` };
  }
  return { label: humanize(key) };
}

export function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

/**
 * Título con el que se muestra un elemento de una lista cuando está plegado.
 * Se busca el primer campo con algo legible, para que diga «Botón SOS» en vez
 * de «Elemento 3».
 */
export function itemTitle(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    for (const k of ['title', 'label', 'name', 'value', 'text', 'quote']) {
      const v = (item as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.trim()) {
        return v.length > 48 ? v.slice(0, 48) + '…' : v;
      }
    }
  }
  if (typeof item === 'string' && item.trim()) return item;
  return `Elemento ${index + 1}`;
}
