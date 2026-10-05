/* Textos de /comunidad. Las publicaciones vienen de la API (/landing/news). */

export const COMMUNITY = {
  eyebrow: 'Comunidad',
  title: 'Comunidad Bugie en {city}.',
  text: 'Historias, avances del producto y novedades de la comunidad de pasajeros y conductores.',
  empty: 'No hay publicaciones disponibles en este idioma.',
};

/** Idiomas en los que se pueden filtrar las publicaciones. */
export const COMMUNITY_LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

/** Color del badge (variante de Bootstrap) según la etiqueta de la publicación. */
export const TAG_COLOR: Record<string, string> = {
  Producto: 'primary',   Seguridad: 'danger',
  Tecnología: 'info',    Tecnologia: 'info',
  Empresa: 'secondary',  Product: 'primary',
  Safety: 'danger',      Technology: 'info',
};
