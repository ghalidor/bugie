/* Datos del sitio público que no son texto editable: dominio e imagen para
   redes sociales.

   Dominio público
   ───────────────
   VITE_PUBLIC_SITE_URL (en .env del despliegue), por ejemplo
       VITE_PUBLIC_SITE_URL=https://www.midominio.pe
   Se usa en la URL canónica, Open Graph y JSON-LD. Si no está definida se
   usa el origen desde el que se abrió la página (sirve en cualquier
   despliegue, pero conviene fijarla para que la canónica sea una sola).

   OJO: public/robots.txt y public/sitemap.xml son archivos estáticos y
   llevan el dominio escrito a mano. Al desplegar, reemplazar en ambos
   "https://bugie.example.com" por el dominio real. */

const env = import.meta.env;

/** Dominio público sin "/" final. */
export const SITE_URL: string = String(env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, '');

export const SITE_NAME = 'Bugie';

/** Imagen por defecto para Open Graph / Twitter (está en public/). */
export const OG_IMAGE = '/bugie.png';

/** URL absoluta de una ruta del sitio. */
export function siteUrl(path = '/'): string {
  return SITE_URL + (path.startsWith('/') ? path : `/${path}`);
}
