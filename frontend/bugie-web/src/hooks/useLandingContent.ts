import { useOutletContext } from 'react-router-dom';
import { useLanding, parse } from './useLanding';
import { fillCity, useCity } from './useCity';

/**
 * Contenido editable de las páginas públicas.
 *
 * Toma el idioma elegido en el menú (PublicLayout lo pasa por el Outlet),
 * carga las secciones del gestor con useLanding y expone `section()`, que
 * devuelve la sección guardada o, si no existe o no llegó, el texto por
 * defecto de src/content/landing.
 *
 * Los textos pueden llevar {city} / {cityCountry}: se rellenan con la ciudad
 * configurada (ver hooks/useCity.ts).
 */
export function useLandingContent() {
  const ctx  = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data, loading } = useLanding(lang);
  const sections = data?.sections ?? [];
  const city = useCity();

  function section<T>(key: string, fallback: T): T {
    return fillCity(parse(sections, key, fallback), city);
  }

  return { lang, loading, section };
}
