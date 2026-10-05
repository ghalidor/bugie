import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LANDING_API } from '../../content/landing/api';
import { FAQ, FAQ_SEARCH } from '../../content/landing/faq';
import { useLandingContent } from '../../hooks/useLandingContent';
import LandingPage from '../../components/landing/LandingPage';
import Eyebrow from '../../components/landing/Eyebrow';

/// Pregunta frecuente como la devuelve el backend (GET /api/landing/faq).
interface FaqItem {
  id:       string;
  lang:     string;
  category: string;
  question: string;
  answer:   string;
}

/// Pregunta con su ancla (#slug) y el texto ya normalizado para buscar.
interface FaqEntryData extends FaqItem {
  slug:   string;
  search: string;
}

/** Minúsculas y sin tildes: "Pagós" -> "pagos". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "¿Cómo pago con Yape?" -> "como-pago-con-yape". */
function slugify(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pregunta';
}

/** Agrega slug único y texto de búsqueda a cada pregunta. */
function prepare(items: FaqItem[]): FaqEntryData[] {
  const used = new Map<string, number>();
  return items.map(item => {
    const base = slugify(item.question);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return {
      ...item,
      slug: n === 0 ? base : `${base}-${n + 1}`,
      search: normalize(`${item.question} ${item.answer} ${item.category}`),
    };
  });
}

/** Resalta los términos buscados en `text` (sin importar tildes ni mayúsculas). */
function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;

  // Texto normalizado carácter por carácter, recordando la posición original.
  let norm = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = normalize(text[i]);
    for (let k = 0; k < piece.length; k++) { norm += piece[k]; origin.push(i); }
  }

  const ranges: [number, number][] = [];
  terms.forEach(term => {
    for (let at = norm.indexOf(term); at !== -1; at = norm.indexOf(term, at + term.length)) {
      ranges.push([origin[at], origin[at + term.length - 1] + 1]);
    }
  });
  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  ranges.forEach(r => {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  });

  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([a, b], i) => {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(<mark key={i} className="bugie-faq-mark">{text.slice(a, b)}</mark>);
    pos = b;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/// Página pública /faq.
/// Mismo estilo "interno" que /empresa o /seguridad: hero pequeño + contenido.
/// Las preguntas vienen del backend agrupadas por categoría. Buscador en vivo
/// + filtro de categoría; cada pregunta tiene un ancla (/faq#slug) que la abre.
export default function Faq() {
  const { lang } = useLandingContent();
  const location = useLocation();
  const navigate = useNavigate();

  const [items, setItems]     = useState<FaqEntryData[]>([]);
  const [loading, setLoading] = useState(true);
  // Pregunta abierta en el acordeón (por slug). Null = todas cerradas. Solo una a la vez.
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  // Categoría seleccionada para filtrar (null = todas).
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  /// true cuando el hash lo cambió esta misma página al abrir una pregunta:
  /// en ese caso no se hace scroll (el usuario ya está ahí).
  const selfNav = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = (l: string): Promise<FaqItem[]> =>
      fetch(`${LANDING_API}/faq?lang=${l}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => (Array.isArray(data) ? data : []));

    setLoading(true);
    // Si el idioma elegido no tiene preguntas publicadas, se muestran las de español.
    load(lang)
      .then(data => (data.length === 0 && lang !== 'es' ? load('es') : data))
      .then(data => { if (alive) setItems(prepare(data)); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [lang]);

  // Al entrar con /faq#slug (o al cambiar el hash) se abre esa pregunta,
  // se quitan los filtros para que se vea y se lleva a la vista.
  useEffect(() => {
    const slug = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!slug || items.length === 0) return;
    if (selfNav.current) { selfNav.current = false; return; }
    if (!items.some(i => i.slug === slug)) return;

    setOpenSlug(slug);
    setActiveCat(null);
    setQuery('');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    requestAnimationFrame(() => {
      document.getElementById(`faq-${slug}`)?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    });
  }, [location.hash, items]);

  // Categorías únicas en el orden en que las trae el backend
  // (ya viene ordenado por Category, SortOrder).
  const categories = useMemo(() => [...new Set(items.map(i => i.category))], [items]);

  const terms = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);

  // Lista visible: categoría + todas las palabras buscadas (en pregunta, respuesta o categoría).
  const visibleItems = items.filter(i =>
    (!activeCat || i.category === activeCat) && terms.every(t => i.search.includes(t)));

  function toggle(slug: string) {
    const next = openSlug === slug ? null : slug;
    setOpenSlug(next);
    // El ancla de la URL sigue a la pregunta abierta, para poder compartirla.
    selfNav.current = next !== null;
    navigate({ pathname: location.pathname, search: location.search, hash: next ? `#${next}` : '' },
             { replace: true, preventScrollReset: true });
  }

  return (
    <LandingPage>

      {/* Hero / introducción de la página */}
      <div className="row g-4 align-items-start mb-4">
        <div className="col-lg-7" data-reveal>
          <div className="bugie-shell-hero">
            <Eyebrow className="">{FAQ.eyebrow}</Eyebrow>
            <h1 className="bugie-h2 mb-3">{FAQ.title}</h1>
            <p className="bugie-lead mb-0">{FAQ.lead}</p>
          </div>
        </div>
        <div className="col-lg-5 d-none d-lg-block" data-reveal>
          <div className="bugie-card p-4 text-center">
            <i className="fa-solid fa-circle-question fa-3x mb-2 bugie-faq-help-icon" />
            <div className="fw-bold">{FAQ.helpTitle}</div>
            <div className="small bugie-muted mb-3">{FAQ.helpText}</div>
            <Link to={FAQ.helpHref} className="btn btn-bugie text-white btn-sm">
              <i className="fa-solid fa-envelope me-2" />{FAQ.helpButton}
            </Link>
          </div>
        </div>
      </div>

      {/* Cuerpo: buscador + filtro + acordeón */}
      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <span className="spinner-border" />
        </div>
      ) : items.length === 0 ? (
        // Estado vacío — la tabla no tiene preguntas publicadas todavía.
        <div className="bugie-card p-5 text-center">
          <i className="fa-solid fa-circle-question fa-2x mb-3 d-block bugie-muted" />
          <div className="fw-semibold mb-1">{FAQ.emptyTitle}</div>
          <div className="small bugie-muted">{FAQ.emptyText}</div>
        </div>
      ) : (
        <>
          {/* Buscador */}
          <div className="mx-auto bugie-faq-list mb-3" data-reveal>
            <div className="bugie-faq-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                className="form-control"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={FAQ_SEARCH.placeholder}
                aria-label={FAQ_SEARCH.label}
                aria-controls="faq-list"
                autoComplete="off"
              />
              {query && (
                <button type="button" className="bugie-faq-search-clear" onClick={() => setQuery('')}
                        aria-label={FAQ_SEARCH.clear} title={FAQ_SEARCH.clear}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="small bugie-muted mt-2 text-center" aria-live="polite">
              {terms.length > 0 ? FAQ_SEARCH.results.replace('{n}', String(visibleItems.length)) : ''}
            </div>
          </div>

          {/* Filtro por categoría (chips). Solo aparece si hay 2+ categorías. */}
          {categories.length > 1 && (
            <div className="d-flex flex-wrap justify-content-center gap-2 mb-4">
              <CategoryChip label={FAQ.allLabel} active={activeCat === null} onClick={() => setActiveCat(null)} />
              {categories.map(c => (
                <CategoryChip key={c} label={c} active={activeCat === c} onClick={() => setActiveCat(c)} />
              ))}
            </div>
          )}

          {/* Acordeón de preguntas */}
          <div className="mx-auto bugie-faq-list" id="faq-list">
            {visibleItems.length === 0 ? (
              <div className="bugie-card p-4 p-md-5 text-center bugie-faq-empty">
                <i className="fa-solid fa-magnifying-glass fa-2x mb-3 d-block bugie-muted" aria-hidden="true" />
                <div className="fw-semibold mb-1">{FAQ_SEARCH.noResultsTitle}</div>
                <div className="small bugie-muted mb-3">{FAQ_SEARCH.noResultsText}</div>
                <Link to={FAQ.helpHref} className="btn btn-bugie text-white btn-sm rounded-pill px-3">
                  <i className="fa-solid fa-envelope me-2" aria-hidden="true" />{FAQ_SEARCH.noResultsLink}
                </Link>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {visibleItems.map(item => (
                  <FaqEntry
                    key={item.id}
                    item={item}
                    terms={terms}
                    open={openSlug === item.slug}
                    showCategory={!activeCat}
                    onToggle={() => toggle(item.slug)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

    </LandingPage>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`btn btn-sm rounded-pill ${active ? 'btn-bugie text-white' : 'btn-outline-secondary'}`}>
      {label}
    </button>
  );
}

interface FaqEntryProps {
  item: FaqEntryData;
  terms: string[];
  open: boolean;
  /** Badge de categoría: solo si no se está filtrando ya por ella. */
  showCategory: boolean;
  onToggle: () => void;
}

/** Pregunta del acordeón. La respuesta se despliega animando max-height
    (ver .bugie-faq-* en styles/landing.scss). */
function FaqEntry({ item, terms, open, showCategory, onToggle }: FaqEntryProps) {
  const [copied, setCopied] = useState(false);
  const answerId = `faq-${item.slug}-answer`;

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#${item.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(FAQ_SEARCH.copyLink, url);   // navegador sin portapapeles
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div id={`faq-${item.slug}`} className={`bugie-card bugie-faq-item${open ? ' is-open' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="bugie-faq-toggle d-flex align-items-center justify-content-between w-100 p-3 text-start"
        aria-expanded={open}
        aria-controls={answerId}>
        <div className="d-flex align-items-center gap-3 flex-grow-1">
          <div className="bugie-faq-plus">
            <i className="fa-solid fa-plus" />
          </div>
          <span className="fw-semibold">{highlight(item.question, terms)}</span>
        </div>
        {/* Badge de categoría — solo visible desde tablet */}
        {showCategory && (
          <span className="badge rounded-pill ms-2 d-none d-md-inline-block bugie-faq-badge">
            {item.category}
          </span>
        )}
      </button>

      <div className="bugie-faq-answer" id={answerId} aria-hidden={!open}>
        <div className="px-3 pb-3">
          <p className="mb-2 bugie-muted">
            {highlight(item.answer, terms)}
          </p>
          <button type="button" className="bugie-faq-copy" onClick={copyLink} tabIndex={open ? 0 : -1}>
            <i className={`fa-solid ${copied ? 'fa-check' : 'fa-link'} me-1`} aria-hidden="true" />
            <span aria-live="polite">{copied ? FAQ_SEARCH.copied : FAQ_SEARCH.copyLink}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
