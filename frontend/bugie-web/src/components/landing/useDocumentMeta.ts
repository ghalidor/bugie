import { useEffect } from 'react';
import { OG_IMAGE, SITE_NAME, siteUrl } from '../../content/landing/site';

/* SEO de las páginas públicas sin librerías: título, meta description,
   URL canónica, Open Graph y Twitter card. Al salir de la página se
   restauran los valores anteriores (los de index.html), para que las
   pantallas con sesión no se queden con el título de una página pública. */

export interface DocumentMeta {
  /** Título de la página; se completa como "<title> | Bugie" salvo que ya incluya "Bugie". */
  title: string;
  description: string;
  /** Ruta canónica ("/faq"). Sin query ni hash. */
  path: string;
  /** Imagen para redes (ruta de public/ o URL absoluta). */
  image?: string;
  /** true: indica a los buscadores que no la indexen (consultas privadas). */
  noindex?: boolean;
}

type Restore = () => void;

/** Crea o actualiza <meta>/<link> y devuelve cómo dejarlo como estaba. */
function upsert(tag: 'meta' | 'link', key: 'name' | 'property' | 'rel', keyValue: string,
                attr: 'content' | 'href', value: string): Restore {
  let el = document.head.querySelector<HTMLElement>(`${tag}[${key}="${keyValue}"]`);
  const created = !el;
  const previous = el?.getAttribute(attr) ?? null;
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(key, keyValue);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
  const node = el;
  return () => {
    if (created) node.remove();
    else if (previous !== null) node.setAttribute(attr, previous);
  };
}

function absolute(url: string): string {
  return /^https?:\/\//i.test(url) ? url : siteUrl(url);
}

export function useDocumentMeta({ title, description, path, image = OG_IMAGE, noindex = false }: DocumentMeta) {
  useEffect(() => {
    const fullTitle = /bugie/i.test(title) ? title : `${title} | ${SITE_NAME}`;
    const url = siteUrl(path);
    const img = absolute(image);

    const prevTitle = document.title;
    document.title = fullTitle;

    const restores: Restore[] = [
      upsert('meta', 'name', 'description', 'content', description),
      upsert('link', 'rel', 'canonical', 'href', url),
      upsert('meta', 'property', 'og:type', 'content', 'website'),
      upsert('meta', 'property', 'og:site_name', 'content', SITE_NAME),
      upsert('meta', 'property', 'og:locale', 'content', 'es_PE'),
      upsert('meta', 'property', 'og:title', 'content', fullTitle),
      upsert('meta', 'property', 'og:description', 'content', description),
      upsert('meta', 'property', 'og:url', 'content', url),
      upsert('meta', 'property', 'og:image', 'content', img),
      upsert('meta', 'name', 'twitter:card', 'content', 'summary_large_image'),
      upsert('meta', 'name', 'twitter:title', 'content', fullTitle),
      upsert('meta', 'name', 'twitter:description', 'content', description),
      upsert('meta', 'name', 'twitter:image', 'content', img),
    ];
    if (noindex) restores.push(upsert('meta', 'name', 'robots', 'content', 'noindex, nofollow'));

    return () => {
      document.title = prevTitle;
      restores.forEach(r => r());
    };
  }, [title, description, path, image, noindex]);
}

/** Inserta un bloque JSON-LD (datos estructurados) mientras el componente está montado. */
export function useJsonLd(id: string, data: object | null) {
  const json = data ? JSON.stringify(data) : '';
  useEffect(() => {
    if (!json) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    el.text = json;
    document.head.appendChild(el);
    return () => el.remove();
  }, [id, json]);
}
