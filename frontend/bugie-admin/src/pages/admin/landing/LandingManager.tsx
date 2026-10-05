import { useEffect, useMemo, useState } from 'react';
import {
  EmptyState, FilterBar, Page, SaveBar, SectionCard, Skeleton, StatusBadge, Tabs, Tone,
  IconButton, useConfirm, useMediaQuery, useToast, useUnsavedChanges,
} from '../../../components/ui';
import ContentForm from './ContentForm';
import { API, ApiError, apiFetch } from '../../../state/api';
import { SECTIONS, GROUPS, EXCLUDED, SectionMeta } from './meta';
import '../siteAdmin.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Gestor de Landing (maestro-detalle).

   Izquierda: grupos → secciones, con buscador y estado por idioma.
   Derecha: el editor de la sección elegida, con el idioma en pestañas.
   En pantallas angostas se ve primero la lista y, al elegir, el editor a
   pantalla completa con un botón "Volver".

   Nada se guarda hasta pulsar Guardar (barra inferior). Cambiar de sección o
   de idioma con cambios pendientes pide confirmación.
   ────────────────────────────────────────────────────────────────────────── */

const LANDING_API = `${API.landing}/landing`;

const LANGS = [
  { code: 'es', label: 'ES', name: 'Español' },
  { code: 'en', label: 'EN', name: 'Inglés' },
  { code: 'pt', label: 'PT', name: 'Portugués' },
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

/** Cuenta cuántos textos tiene un contenido y cuántos están llenos. */
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

/** Estado de una sección en los tres idiomas, en palabras. */
function sectionStatus(meta: SectionMeta, store: Store): { text: string; tone: Tone; icon: string } {
  if (meta.unused) return { text: 'El sitio no la usa', tone: 'neutral', icon: 'fa-eye-slash' };
  const faltan = LANGS.filter(l => !store[l.code]?.[meta.key]);
  if (faltan.length === 0) return { text: 'Completa', tone: 'ok', icon: 'fa-circle-check' };
  if (faltan.length === LANGS.length) return { text: 'Sin contenido', tone: 'bad', icon: 'fa-circle-xmark' };
  return { text: 'Falta ' + faltan.map(l => l.label).join(' y '), tone: 'warn', icon: 'fa-language' };
}

const SWITCH_OPTS = {
  title: '¿Descartar los cambios?',
  message: 'Tienes cambios sin guardar en esta sección. Si continúas se perderán.',
  confirmText: 'Descartar y continuar',
  cancelText: 'Seguir editando',
  tone: 'warning' as const,
};

export default function LandingManager() {
  const toast   = useToast();
  const confirm = useConfirm();
  const narrow  = useMediaQuery('(max-width: 991.98px)');

  const [store,    setStore]    = useState<Store>({});
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  const [lang,     setLang]     = useState<Lang>('es');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['home']));
  const [listQ,    setListQ]    = useState('');

  const [draft,    setDraft]    = useState<any>(null);
  const [saving,   setSaving]   = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [search,   setSearch]   = useState('');

  /* ── Cargar los tres idiomas ──────────────────────────────────────── */
  useEffect(() => {
    setLoading(true); setLoadErr(null);
    Promise.all(LANGS.map(l =>
      apiFetch<{ sections?: ApiSection[] }>(`${LANDING_API}?lang=${l.code}`)
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
      .catch(e => setLoadErr(e instanceof ApiError ? `No se pudo cargar el contenido: ${e.message}` : 'No se pudo cargar el contenido. Vuelve a intentarlo.'))
      .finally(() => setLoading(false));
  }, []);

  const meta = useMemo(() => SECTIONS.find(s => s.key === selected) ?? null, [selected]);

  /** Cambios sin guardar. */
  const dirty = useMemo(() => {
    if (!selected || !draft) return false;
    // "No existe" y "objeto vacío" son lo mismo para quien edita.
    const original = store[lang]?.[selected] ?? {};
    return JSON.stringify(original) !== JSON.stringify(draft ?? {});
  }, [draft, store, lang, selected]);

  useUnsavedChanges(dirty);

  function open(key: string, toLang: Lang = lang) {
    const existing = store[toLang]?.[key];
    // Al traducir se parte de la estructura del español con los textos en
    // blanco, para que no falte ningún campo en el idioma nuevo.
    const base = existing ?? (toLang === 'es' ? {} : emptyLike(store.es?.[key] ?? {}));
    setSelected(key);
    setLang(toLang);
    setDraft(JSON.parse(JSON.stringify(base)));
    setSearch('');
    const g = SECTIONS.find(s => s.key === key)?.group;
    if (g) setExpanded(prev => new Set(prev).add(g));
  }

  /** Cambia de sección/idioma preguntando si hay cambios sin guardar. */
  async function guardedOpen(key: string, toLang: Lang = lang) {
    if (key === selected && toLang === lang) return;
    if (dirty && !(await confirm(SWITCH_OPTS))) return;
    open(key, toLang);
  }

  async function goBack() {
    if (dirty && !(await confirm(SWITCH_OPTS))) return;
    setSelected(null); setDraft(null);
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      await apiFetch(`${LANDING_API}/section`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey: selected, lang, contentJson: JSON.stringify(draft) }),
      });
      setStore(prev => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), [selected]: draft } }));
      toast.success(`Se publicó «${meta?.label ?? selected}» en ${LANGS.find(l => l.code === lang)?.name}.`, 'Guardado');
    } catch (e) {
      toast.error(e instanceof ApiError ? `No se pudo guardar: ${e.message}` : 'No se pudo guardar. Vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Lista (maestro) ──────────────────────────────────────────────── */
  const q = listQ.trim().toLowerCase();
  const groups = GROUPS.map(g => ({
    ...g,
    sections: SECTIONS.filter(s => s.group === g.key && !EXCLUDED.includes(s.key)
      && (!q || s.label.toLowerCase().includes(q) || s.where.toLowerCase().includes(q) || s.key.includes(q))),
  })).filter(g => g.sections.length > 0);

  const toggleGroup = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const master = (
    <SectionCard title="Secciones del sitio" icon="fa-sitemap" className="sa-md-master" tourId="landing-list"
                 description="Elige qué parte de la web quieres editar.">
      <div className="mb-3" data-tour="landing-search">
        <FilterBar search={listQ} onSearchChange={setListQ} searchPlaceholder="Buscar sección…" />
      </div>
      {loading ? (
        <Skeleton height={44} count={6} />
      ) : groups.length === 0 ? (
        <EmptyState compact title="Sin resultados" text={`Ninguna sección coincide con «${listQ}».`} />
      ) : (
        <nav aria-label="Secciones de la landing" className="d-grid gap-2">
          {groups.map(g => {
            const isOpen = !!q || expanded.has(g.key);
            return (
              <div key={g.key} className="sa-nav-group">
                <button type="button" className="sa-nav-title" aria-expanded={isOpen}
                        onClick={() => toggleGroup(g.key)}>
                  <i className={`fa-solid ${g.icon}`} aria-hidden="true" />
                  {g.label}
                  <span className="count">{g.sections.length}</span>
                  <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
                </button>
                {isOpen && g.sections.map(s => {
                  const st = sectionStatus(s, store);
                  return (
                    <button key={s.key} type="button"
                            className={`sa-item sa-anim ${selected === s.key ? 'active' : ''}`}
                            aria-current={selected === s.key ? 'true' : undefined}
                            onClick={() => guardedOpen(s.key)}>
                      <i className={`fa-solid ${s.icon}`} aria-hidden="true" />
                      <span className="text">
                        <span className="name">{s.label}</span>
                        <span className="sub">{s.where}</span>
                        <span><StatusBadge size="sm" tone={st.tone} icon={st.icon}>{st.text}</StatusBadge></span>
                      </span>
                      {narrow && <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      )}
    </SectionCard>
  );

  /* ── Editor (detalle) ─────────────────────────────────────────────── */
  const langTabs = selected ? LANGS.map(l => {
    const content = store[l.code]?.[selected];
    const [filled, total] = content ? countFilled(content) : [0, 0];
    const pendientes = total - filled;
    return {
      value: l.code,
      label: <span title={!content ? `Todavía no existe en ${l.name}` : pendientes > 0 ? `${pendientes} textos vacíos` : `Completo en ${l.name}`}>
        {l.name}{!content && <span className="bugie-muted ms-1">(vacío)</span>}
      </span>,
      count: content && pendientes > 0 ? pendientes : undefined,
    };
  }) : [];

  const editor = selected && meta && draft ? (
    <div className="d-grid gap-3 sa-anim-slide" key={selected}>
      <SectionCard
        icon={meta.icon}
        title={meta.label}
        description={meta.where}
        tourId="landing-editor"
        actions={
          <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                  onClick={() => setShowJson(v => !v)} aria-pressed={showJson}>
            <i className={`fa-solid ${showJson ? 'fa-pen-to-square' : 'fa-code'} me-1`} aria-hidden="true" />
            {showJson ? 'Ver formulario' : 'Ver JSON'}
          </button>
        }
      >
        <div className="d-grid gap-3">
          <div data-tour="landing-lang">
            <Tabs ariaLabel="Idioma" items={langTabs} value={lang}
                  onChange={v => guardedOpen(selected, v as Lang)} />
            <p className="small bugie-muted mt-2 mb-0">
              El número junto al idioma indica cuántos textos faltan llenar.
            </p>
          </div>

          {meta.unused && (
            <div className="sa-note bx-tone-neutral">
              <i className="fa-solid fa-eye-slash" aria-hidden="true" />
              <span>
                <strong>El sitio público no muestra esta sección.</strong> Nada en la web lee este
                contenido, así que lo que escribas aquí no se verá.
                {selected === 'navbar' && ' Los enlaces del menú están escritos directamente en PublicTopNav.tsx.'}
              </span>
            </div>
          )}

          {lang !== 'es' && !store[lang]?.[selected] && Object.keys(draft).length > 0 && (
            <div className="sa-note bx-tone-warn">
              <i className="fa-solid fa-language" aria-hidden="true" />
              <span>
                Esta sección todavía no existe en {LANGS.find(l => l.code === lang)?.name}. Cargamos
                los campos del español en blanco: cada uno muestra el texto original con un botón para copiarlo.
              </span>
            </div>
          )}

          {Object.keys(draft).length > 0 && !showJson && (
            <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar campo…" />
          )}
        </div>
      </SectionCard>

      {Object.keys(draft).length === 0 ? (
        <SectionCard>
          <EmptySection meta={meta} lang={lang} store={store}
                        onStartFrom={from => setDraft(emptyLike(store[from][selected!]))} />
        </SectionCard>
      ) : showJson ? (
        <SectionCard title="Contenido en JSON" icon="fa-code" description="Solo lectura. Para editar, vuelve al formulario.">
          <pre className="sa-json">{JSON.stringify(draft, null, 2)}</pre>
        </SectionCard>
      ) : (
        <ContentForm value={draft} onChange={setDraft} search={search}
                     reference={lang === 'es' ? undefined : store.es?.[selected]}
                     translating={lang !== 'es'} />
      )}

      <SaveBar dirty={dirty} saving={saving} onSave={save}
               onDiscard={() => open(selected, lang)}
               saveText={`Guardar ${lang.toUpperCase()}`}
               message="Cambios sin guardar: se publican al guardar" />
    </div>
  ) : (
    <SectionCard tourId="landing-editor">
      <EmptyState icon="fa-hand-pointer" title="Elige una sección"
                  text="Selecciona una sección de la lista para editar sus textos en español, inglés y portugués." />
    </SectionCard>
  );

  const showEditorOnly = narrow && !!selected;

  return (
    <Page title="Contenido del sitio web"
          subtitle="Edita los textos de la web pública en los tres idiomas."
          icon="fa-paintbrush"
          helpKey="landing">
      {loadErr && (
        <div className="sa-note bx-tone-bad" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{loadErr}</span>
        </div>
      )}

      {showEditorOnly ? (
        <div className="d-grid gap-3">
          <div className="sa-backbar">
            <IconButton icon="fa-arrow-left" label="Volver a la lista" onClick={goBack} />
            <span className="title">{meta?.label}</span>
          </div>
          {editor}
        </div>
      ) : (
        <div className="sa-md">
          {master}
          {!narrow && <div className="sa-md-detail">{editor}</div>}
        </div>
      )}
    </Page>
  );
}

/* ── Qué mostrar cuando la sección no tiene nada ───────────────────────── */
function EmptySection({ meta, lang, store, onStartFrom }: {
  meta: SectionMeta; lang: Lang; store: Store; onStartFrom: (from: Lang) => void;
}) {
  // Idiomas que sí tienen contenido y pueden servir de molde.
  const fuentes = LANGS.filter(l => l.code !== lang && store[l.code]?.[meta.key]);
  const langName = LANGS.find(l => l.code === lang)?.name;

  if (fuentes.length > 0) {
    return (
      <EmptyState
        icon="fa-folder-open"
        title="Esta sección todavía no tiene contenido"
        text={`No hay nada guardado en ${langName}. Empieza copiando la estructura de otro idioma: se crean los mismos campos, vacíos y listos para escribir.`}
        action={
          <div className="d-flex justify-content-center gap-2 flex-wrap">
            {fuentes.map(f => (
              <button key={f.code} type="button" className="btn btn-bugie rounded-pill"
                      onClick={() => onStartFrom(f.code)}>
                <i className="fa-solid fa-wand-magic-sparkles me-2" aria-hidden="true" />
                Usar los campos de {f.name}
              </button>
            ))}
          </div>
        }
      />
    );
  }

  return (
    <EmptyState
      icon="fa-folder-open"
      title="Esta sección todavía no tiene contenido"
      text={'No existe en ningún idioma, así que no hay de dónde copiar los campos.' + (meta.unused
        ? ' Además, el sitio público no lee esta sección: se puede dejar así.'
        : ' Para crearla desde cero hace falta saber qué campos espera la web; defínelos con quien desarrolló esa página.')}
    />
  );
}
