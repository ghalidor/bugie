import { useEffect, useMemo, useState } from 'react';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

/* ──────────────────────────────────────────────────────────────────────────
   Modo previsualización
   ─────────────────────────────────────────────────────────────────────────
   Cuando la URL trae ?preview=1, esta página está embebida en un iframe
   dentro del gestor. El gestor le manda el contenido que se está editando y
   la página lo pinta SIN guardarlo en la base: es solo un borrador en memoria.

   Así el gestor no tiene que dibujar su propia previsualización de cada
   sección. Lo que se ve es el sitio real, con su CSS y su tipografía.

   Fuera de ?preview=1 nada de esto se activa: el sitio público funciona
   exactamente igual que antes.
   ────────────────────────────────────────────────────────────────────────── */

const params      = new URLSearchParams(window.location.search);
const PREVIEW     = params.get('preview') === '1';
const PREVIEW_LANG = params.get('lang');

/// Orígenes autorizados a inyectar borradores. Configurable por si el gestor
/// se despliega en otro dominio. Nunca se acepta un mensaje de otro origen.
/// Por defecto se aceptan las dos formas de escribir la misma máquina:
/// localhost y 127.0.0.1 son orígenes DISTINTOS para el navegador, y olvidarlo
/// hace que la previsualización quede muda sin dar ningún error.
const ALLOWED_ORIGINS = (import.meta.env.VITE_PREVIEW_ORIGINS
  ?? 'http://localhost:5174,http://127.0.0.1:5174')
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean);

export interface SectionItem {
  sectionId:   string;
  sectionKey:  string;
  sortOrder:   number;
  contentJson: string;
}

export interface LandingData {
  lang:     string;
  sections: SectionItem[];
}

export function useLanding(lang = 'es') {
  // En previsualización manda el idioma de la URL, para que el gestor pueda
  // cambiarlo sin depender del selector del sitio.
  const effectiveLang = PREVIEW && PREVIEW_LANG ? PREVIEW_LANG : lang;

  const [data,  setData]  = useState<LandingData | null>(null);
  const [error, setError] = useState(false);

  /// sectionKey -> contentJson que está escribiendo el editor ahora mismo.
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch(`${LANDING_API}?lang=${effectiveLang}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [effectiveLang]);

  useEffect(() => {
    if (!PREVIEW) return;

    function onMessage(e: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(e.origin)) return;   // solo el gestor

      const msg = e.data;
      if (!msg || msg.type !== 'bugie-preview') return;
      if (typeof msg.sectionKey !== 'string') return;

      setDraft(prev => ({ ...prev, [msg.sectionKey]: String(msg.contentJson ?? '') }));
    }

    window.addEventListener('message', onMessage);

    // Avisar al gestor que ya se puede mandar el borrador. Sin este aviso,
    // el primer mensaje se perdería si llega antes de que cargue la página.
    // El aviso no lleva datos, solo dice "ya cargué", así que puede ir a
    // cualquier origen. Lo que sí se valida es lo que ENTRA.
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'bugie-preview-ready' }, '*');
    }

    return () => window.removeEventListener('message', onMessage);
  }, []);

  // El borrador pisa lo que vino de la base, sin tocarla.
  const merged = useMemo(() => {
    if (!data || !PREVIEW) return data;
    const keys = Object.keys(draft);
    if (keys.length === 0) return data;

    const sections = data.sections.map(s =>
      draft[s.sectionKey] != null ? { ...s, contentJson: draft[s.sectionKey] } : s);

    // Secciones que todavía no existen en la base pero sí en el editor.
    keys.forEach(k => {
      if (!sections.some(s => s.sectionKey === k)) {
        sections.push({ sectionId: k, sectionKey: k, sortOrder: 0, contentJson: draft[k] });
      }
    });

    return { ...data, sections };
  }, [data, draft]);

  // Cargando = todavia no llego la respuesta ni hubo error.
  return { data: merged, error, loading: data === null && !error };
}

export function parse<T>(sections: SectionItem[], key: string, fallback: T): T {
  const s = sections.find(s => s.sectionKey === key);
  if (!s?.contentJson) return fallback;
  try {
    const parsed = JSON.parse(s.contentJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    if (Object.keys(parsed).length === 0) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}
