import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../../components/PageHeader';
import ContentForm from './ContentForm';
import { SECTIONS, GROUPS, EXCLUDED, SectionMeta } from './meta';

/* ──────────────────────────────────────────────────────────────────────────
   Gestor de Landing.

   Edita el contenido del sitio público con un formulario, en vez del JSON
   crudo. El formulario se genera del propio contenido, así que un campo nuevo
   aparece solo, y los nombres en español salen del diccionario de meta.ts.

   Nada se guarda hasta pulsar Guardar.
   ────────────────────────────────────────────────────────────────────────── */

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const LANGS = [
  { code: 'es', label: 'ES', flag: '🇵🇪', name: 'Español' },
  { code: 'en', label: 'EN', flag: '🇺🇸', name: 'Inglés' },
  { code: 'pt', label: 'PT', flag: '🇧🇷', name: 'Portugués' },
] as const;
type Lang = typeof LANGS[number]['code'];

interface ApiSection { sectionId: string; sectionKey: string; sortOrder: number; contentJson: string; }

/** Contenido por idioma y sección, ya convertido a objeto. */
type Store = Record<string, Record<string, any>>;

const safeParse = (raw: string | undefined) => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { return null; }
};

/** Copia la estructura dejando los textos vacíos. */
function emptyLike(v: any): any {
  if (Array.isArray(v)) return v.map(emptyLike);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptyLike(x)]));
  }
  return '';
}

/** Cuenta cuántos textos tiene un contenido y cuántos están vacíos. */
function countFilled(v: any): [filled: number, total: number] {
  let filled = 0, total = 0;
  const walk = (x: any) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x !== null && typeof x === 'object') Object.values(x).forEach(walk);
    else { total++; if (String(x ?? '').trim() !== '') filled++; }
  };
  walk(v);
  return [filled, total];
}

export default function LandingManager() {
  const [store,    setStore]    = useState<Store>({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [group,    setGroup]    = useState<string>('home');
  const [lang,     setLang]     = useState<Lang>('es');
  const [selected, setSelected] = useState<string | null>(null);

  const [draft,    setDraft]    = useState<any>(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [search,   setSearch]   = useState('');

  /* ── Cargar los tres idiomas ──────────────────────────────────────── */
  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all(LANGS.map(l =>
      fetch(`${LANDING_API}?lang=${l.code}`)
        .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
        .then(d => [l.code, (d.sections ?? []) as ApiSection[]] as const)
    ))
      .then(pairs => {
        const next: Store = {};
        pairs.forEach(([code, sections]) => {
          next[code] = {};
          sections.forEach(s => {
            const parsed = safeParse(s.contentJson);
            if (parsed) next[code][s.sectionKey] = parsed;
          });
        });
        setStore(next);
      })
      .catch(e => setError(`No se pudo cargar el contenido: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const meta = useMemo(() => SECTIONS.find(s => s.key === selected) ?? null, [selected]);

  /** Cambios sin guardar. */
  const dirty = useMemo(() => {
    if (!selected || !draft) return false;
    // "no existe" y "objeto vacío" son lo mismo para el usuario: si no lo
    // tratáramos igual, una sección vacía diría "cambios sin guardar" al abrirla.
    const original = store[lang]?.[selected] ?? {};
    return JSON.stringify(original) !== JSON.stringify(draft ?? {});
  }, [draft, store, lang, selected]);

  function open(key: string, toLang: Lang = lang) {
    const existing = store[toLang]?.[key];
    // Al traducir se parte de la estructura del español con los textos en
    // blanco, para que no falte ningún campo en el idioma nuevo.
    const base = existing ?? (toLang === 'es' ? {} : emptyLike(store.es?.[key] ?? {}));
    setSelected(key);
    setLang(toLang);
    setDraft(JSON.parse(JSON.stringify(base)));
    setSaved(false);
    setSearch('');
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true); setError(null);
    try {
      const token = localStorage.getItem('bugie_token') ?? '';
      const res = await fetch(`${LANDING_API}/section`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sectionKey: selected, lang, contentJson: JSON.stringify(draft) }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? `Error ${res.status}`);
      }
      setStore(prev => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), [selected]: draft } }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const visible = SECTIONS.filter(s => s.group === group && !EXCLUDED.includes(s.key));

  return (
    <>
      <PageHeader title="Gestor de Landing"
                  subtitle="Edita los textos del sitio público en los tres idiomas."
                  icon="fa-solid fa-paintbrush" />

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {/* Grupos */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        {GROUPS.map(g => (
          <button key={g.key} type="button"
                  onClick={() => { setGroup(g.key); setSelected(null); setDraft(null); }}
                  className={`btn btn-sm rounded-pill ${group === g.key ? 'btn-bugie' : 'btn-bugie-outline'}`}>
            <i className={`fa-solid ${g.icon} me-1`} />{g.label}
          </button>
        ))}
        {loading && <span className="spinner-border spinner-border-sm ms-2" />}
      </div>

      {/* Secciones */}
      <div className="row g-2 mb-3">
        {visible.map(s => (
          <div key={s.key} className="col-12 col-sm-6 col-lg-4 col-xxl-3">
            <SectionCard meta={s} store={store} active={selected === s.key} onClick={() => open(s.key)} />
          </div>
        ))}
      </div>

      {!selected && !loading && (
        <div className="bugie-card">
          <div className="bugie-card-body text-center py-5 bugie-muted">
            <i className="fa-solid fa-hand-pointer fa-2x d-block mb-3" style={{ opacity: .4 }} />
            Elige una sección para editar sus textos.
          </div>
        </div>
      )}

      {selected && meta && draft && (
        <div className="bugie-card">
          {/* Barra de la sección */}
          <div className="bugie-card-header d-flex flex-wrap align-items-center gap-2">
            <i className={`fa-solid ${meta.icon}`} />
            <span className="fw-semibold">{meta.label}</span>
            <span className="small bugie-muted d-none d-md-inline">· {meta.where}</span>

            <div className="ms-auto d-flex flex-wrap align-items-center gap-2">
              <input className="form-control form-control-sm" style={{ width: 170 }}
                     placeholder="Buscar campo…" value={search}
                     onChange={e => setSearch(e.target.value)} />
              <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill py-0 px-2"
                      style={{ fontSize: '.74rem' }} onClick={() => setShowJson(v => !v)}>
                {showJson ? 'Ver formulario' : 'Ver JSON'}
              </button>
            </div>
          </div>

          <div className="bugie-card-body">
            {/* Idiomas */}
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <span className="small bugie-muted">Idioma:</span>
              {LANGS.map(l => {
                const content = store[l.code]?.[selected];
                const [filled, total] = content ? countFilled(content) : [0, 0];
                const pendientes = total - filled;
                const aviso = !content
                  ? `Todavía no existe en ${l.name}`
                  : pendientes > 0
                  ? `${pendientes} ${pendientes === 1 ? 'texto vacío' : 'textos vacíos'} en ${l.name}`
                  : `Completo en ${l.name}`;
                return (
                  <button key={l.code} type="button" title={aviso}
                          onClick={() => {
                            if (dirty && !confirm('Hay cambios sin guardar. ¿Cambiar de idioma y perderlos?')) return;
                            open(selected, l.code);
                          }}
                          className={`btn btn-sm rounded-pill ${lang === l.code ? 'btn-bugie' : 'btn-bugie-outline'}`}>
                    <span className="me-1">{l.flag}</span>{l.name}
                    {!content && (
                      <span className="ms-2" style={{ fontSize: '.68rem', opacity: .85 }}>vacío</span>
                    )}
                    {content && pendientes > 0 && (
                      <span className="ms-2" style={{ fontSize: '.68rem', opacity: .85 }}>
                        faltan {pendientes}
                      </span>
                    )}
                  </button>
                );
              })}

              {dirty && (
                <span className="small ms-auto" style={{ color: '#f59e0b' }}>
                  <i className="fa-solid fa-circle-exclamation me-1" />Cambios sin guardar
                </span>
              )}
            </div>

            {meta.unused && (
              <div className="alert small py-2 d-flex gap-2"
                   style={{ background: '#94a3b81a', border: '1px solid #94a3b840', color: 'inherit' }}>
                <i className="fa-solid fa-eye-slash mt-1" />
                <span>
                  <strong>El sitio público no muestra esta sección.</strong> Revisado en el código de
                  la web: nada lee este contenido, así que lo que escribas aquí no se verá.
                  {selected === 'navbar' && ' Los enlaces del menú están escritos directamente en PublicTopNav.tsx.'}
                </span>
              </div>
            )}

            {lang !== 'es' && !store[lang]?.[selected] && Object.keys(draft).length > 0 && (
              <div className="alert alert-warning small py-2">
                Esta sección todavía no existe en {LANGS.find(l => l.code === lang)?.name}.
                Se cargaron los campos del español en blanco: cada uno muestra el texto
                original debajo, con un botón para copiarlo.
              </div>
            )}

            {Object.keys(draft).length === 0 ? (
              <EmptySection meta={meta} lang={lang} store={store}
                            onStartFrom={from => setDraft(emptyLike(store[from][selected!]))} />
            ) : showJson ? (
              <pre className="small p-3 mb-0" style={{
                background: 'var(--bugie-bg-2, rgba(125,125,160,.07))', borderRadius: 10,
                maxHeight: 520, overflow: 'auto',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>{JSON.stringify(draft, null, 2)}</pre>
            ) : (
              <ContentForm value={draft} onChange={setDraft} search={search}
                           reference={lang === 'es' ? undefined : store.es?.[selected]}
                           translating={lang !== 'es'} />
            )}

            {/* Acciones */}
            <div className="d-flex flex-wrap align-items-center gap-2 mt-3 pt-3"
                 style={{ borderTop: '1px solid var(--bugie-border)' }}>
              <button type="button" className="btn btn-bugie rounded-pill px-4"
                      onClick={save} disabled={saving || !dirty}>
                {saving
                  ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                  : <><i className="fa-solid fa-floppy-disk me-2" />Guardar {lang.toUpperCase()}</>}
              </button>
              <button type="button" className="btn btn-bugie-outline rounded-pill"
                      onClick={() => open(selected, lang)} disabled={saving || !dirty}>
                Descartar cambios
              </button>
              {saved && (
                <span className="small" style={{ color: '#34d399' }}>
                  <i className="fa-solid fa-circle-check me-1" />Guardado
                </span>
              )}
              <span className="small bugie-muted ms-auto">
                Los cambios se publican al guardar.
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Qué mostrar cuando la sección no tiene nada ───────────────────────── */
function EmptySection({ meta, lang, store, onStartFrom }: {
  meta: SectionMeta; lang: Lang; store: Store; onStartFrom: (from: Lang) => void;
}) {
  // Idiomas que sí tienen contenido y pueden servir de molde.
  const fuentes = LANGS.filter(l => l.code !== lang && store[l.code]?.[meta.key]);

  return (
    <div className="text-center py-4 px-3">
      <i className="fa-regular fa-folder-open fa-2x d-block mb-3" style={{ opacity: .35 }} />
      <div className="fw-semibold mb-1">Esta sección todavía no tiene contenido</div>

      {fuentes.length > 0 ? (
        <>
          <div className="small bugie-muted mb-3">
            No hay nada guardado en {LANGS.find(l => l.code === lang)?.name}.
            Puedes empezar copiando la estructura de otro idioma: se crean los mismos
            campos, vacíos y listos para escribir.
          </div>
          <div className="d-flex justify-content-center gap-2 flex-wrap">
            {fuentes.map(f => (
              <button key={f.code} type="button" className="btn btn-bugie rounded-pill"
                      onClick={() => onStartFrom(f.code)}>
                <i className="fa-solid fa-wand-magic-sparkles me-2" />
                Empezar con los campos de {f.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="small bugie-muted" style={{ maxWidth: 520, margin: '0 auto' }}>
          No existe en ningún idioma, así que no hay de dónde copiar los campos.
          {meta.unused
            ? ' Además, el sitio público no lee esta sección: se puede dejar así.'
            : ' Para crearla desde cero hace falta saber qué campos espera la web; conviene definirlos con quien desarrolló esa página.'}
        </div>
      )}
    </div>
  );
}

/* ── Tarjeta de sección ────────────────────────────────────────────────── */
function SectionCard({ meta, store, active, onClick }: {
  meta: SectionMeta; store: Store; active: boolean; onClick: () => void;
}) {
  const faltan = LANGS.filter(l => !store[l.code]?.[meta.key]);

  // En vez de "2/3", que no dice nada, se escribe qué pasa.
  let estado: string;
  let color: string;
  if (faltan.length === 0)            { estado = 'Completo en los 3 idiomas'; color = '#34d399'; }
  else if (faltan.length === LANGS.length) { estado = 'Sin contenido';        color = '#ef4444'; }
  else                                { estado = 'Falta ' + faltan.map(l => l.label).join(' y '); color = '#f59e0b'; }

  return (
    <button type="button" onClick={onClick} className="bugie-card w-100 p-3 text-start h-100"
            style={{ cursor: 'pointer', border: active ? '2px solid var(--bugie-primary)' : undefined }}>
      <div className="d-flex align-items-center gap-2 mb-1">
        <i className={`fa-solid ${meta.icon}`}
           style={{ color: active ? 'var(--bugie-primary)' : undefined, width: 16 }} />
        <span className="small fw-semibold">{meta.label}</span>
      </div>

      <div className="small bugie-muted text-truncate mb-2" style={{ fontSize: '.74rem' }}>
        {meta.where}
      </div>

      {meta.unused ? (
        <span className="badge rounded-pill"
              style={{ background: '#94a3b822', color: '#94a3b8', fontSize: '.66rem', fontWeight: 600 }}>
          <i className="fa-solid fa-eye-slash me-1" />El sitio no la usa
        </span>
      ) : (
        <span className="small fw-semibold" style={{ color, fontSize: '.74rem' }}>
          <i className="fa-solid fa-circle me-1" style={{ fontSize: '.4rem', verticalAlign: 'middle' }} />
          {estado}
        </span>
      )}
    </button>
  );
}
