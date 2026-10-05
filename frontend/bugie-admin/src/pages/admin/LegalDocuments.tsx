import { useEffect, useState } from 'react';
import RichTextEditor from '../../components/RichTextEditor';
import { API, ApiError, apiFetch } from '../../state/api';
import {
  Field, Page, SaveBar, SectionCard, Skeleton, Tabs, useConfirm, useToast, useUnsavedChanges,
} from '../../components/ui';
import './siteAdmin.scss';

const LANGS = ['es', 'en', 'pt'] as const;
type Lang = typeof LANGS[number];

const DOCUMENTS = [
  { key: 'terms',   label: 'Términos y Condiciones', icon: 'fa-file-contract', desc: 'Reglas de uso de Bugie' },
  { key: 'privacy', label: 'Política de Privacidad', icon: 'fa-user-shield',   desc: 'Cómo tratamos los datos personales' },
] as const;
type DocKey = typeof DOCUMENTS[number]['key'];

// Forma del JSON guardado en landing.SectionContents.ContentJson
interface LegalContent {
  title:        string;
  updatedLabel: string;
  updatedAt:    string;
  html:         string;
}

const EMPTY: LegalContent = {
  title: '', updatedLabel: 'Última actualización', updatedAt: '', html: '',
};

const LANG_LABEL: Record<Lang, string> = { es: 'Español', en: 'Inglés', pt: 'Portugués' };

/** Hoy (yyyy-mm-dd, hora local). */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** "04/10/2026" de "2026-10-04". */
const fmtDay = (iso: string) => { const [y, m, d] = iso.split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };

interface Section {
  sectionId:   string;
  sectionKey:  string;
  sortOrder:   number;
  contentJson: string;
}

const SWITCH_OPTS = {
  title: '¿Descartar los cambios?',
  message: 'Tienes cambios sin guardar en este documento. Si continúas se perderán.',
  confirmText: 'Descartar y continuar',
  cancelText: 'Seguir editando',
  tone: 'warning' as const,
};

export default function LegalDocuments() {
  const toast   = useToast();
  const confirm = useConfirm();

  const [doc,      setDoc]      = useState<DocKey>('terms');
  const [lang,     setLang]     = useState<Lang>('es');
  const [content,  setContent]  = useState<LegalContent>(EMPTY);
  const [original, setOriginal] = useState<LegalContent>(EMPTY);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  const dirty = JSON.stringify(content) !== JSON.stringify(original);
  useUnsavedChanges(dirty);

  // Cargar contenido cuando cambia documento o idioma
  useEffect(() => {
    setLoading(true); setLoadErr(null);
    const apply = (c: LegalContent) => { setContent(c); setOriginal(c); };
    apiFetch<{ sections?: Section[] }>(`${API.landing}/landing?lang=${lang}`)
      .then(data => {
        const sections: Section[] = data.sections ?? [];
        const section = sections.find(s => s.sectionKey === doc);
        if (!section) {
          // La sección no existe todavía: plantilla vacía.
          apply({ ...EMPTY, title: doc === 'terms' ? 'Términos y Condiciones' : 'Política de Privacidad' });
          return;
        }
        try {
          apply({ ...EMPTY, ...JSON.parse(section.contentJson) });
        } catch {
          apply({ ...EMPTY, html: section.contentJson });
        }
      })
      .catch(e => setLoadErr(e instanceof ApiError ? `No se pudo cargar: ${e.message}` : 'No se pudo cargar el documento. Vuelve a intentarlo.'))
      .finally(() => setLoading(false));
  }, [doc, lang]);

  function update<K extends keyof LegalContent>(key: K, value: LegalContent[K]) {
    setContent(prev => ({ ...prev, [key]: value }));
  }

  async function changeDoc(d: DocKey) {
    if (d === doc) return;
    if (dirty && !(await confirm(SWITCH_OPTS))) return;
    setDoc(d);
  }

  async function changeLang(l: Lang) {
    if (l === lang) return;
    if (dirty && !(await confirm(SWITCH_OPTS))) return;
    setLang(l);
  }

  async function save() {
    // Fecha de vigencia: si cambió el texto y no tocaste la fecha, se publica con
    // la de hoy (para no dejar una fecha vieja en un texto nuevo).
    const textChanged = content.html !== original.html || content.title !== original.title;
    const dateTouched = content.updatedAt !== original.updatedAt;
    const effective = (textChanged && !dateTouched) || !content.updatedAt ? todayIso() : content.updatedAt;
    const ok = await confirm({
      title: `¿Publicar ${currentDoc.label}?`,
      message: <>Se publicará en la web en <strong>{LANG_LABEL[lang]}</strong> con fecha de vigencia
        {' '}<strong>{fmtDay(effective)}</strong>{effective === todayIso() ? ' (hoy)' : ''}.
        {' '}Si quieres otra fecha, cancela y cámbiala en «Vigente desde».</>,
      confirmText: 'Publicar',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const saved: LegalContent = { ...content, updatedAt: effective };
      await apiFetch(`${API.landing}/landing/section`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey: doc, lang, contentJson: JSON.stringify(saved) }),
      });
      setContent(saved); setOriginal(saved);
      toast.success(`${currentDoc.label} (${LANG_LABEL[lang]}) publicado en la web, vigente desde el ${fmtDay(effective)}.`, 'Publicado');
    } catch (e) {
      toast.error(e instanceof ApiError ? `No se pudo publicar: ${e.message}` : 'No se pudo publicar. Vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  const currentDoc = DOCUMENTS.find(d => d.key === doc)!;

  return (
    <Page
      title="Documentos legales"
      subtitle="Términos y Condiciones y Política de Privacidad, en los tres idiomas."
      icon="fa-gavel"
      helpKey="legal"
    >
      <div className="sa-md">
        <SectionCard title="Documentos" icon="fa-folder-open" className="sa-md-master" tourId="legal-docs">
          <nav aria-label="Documentos legales" className="d-grid gap-1">
            {DOCUMENTS.map(d => (
              <button key={d.key} type="button"
                      className={`sa-item ${doc === d.key ? 'active' : ''}`}
                      aria-current={doc === d.key ? 'true' : undefined}
                      onClick={() => changeDoc(d.key)}>
                <i className={`fa-solid ${d.icon}`} aria-hidden="true" />
                <span className="text">
                  <span className="name">{d.label}</span>
                  <span className="sub">{d.desc}</span>
                </span>
              </button>
            ))}
          </nav>
        </SectionCard>

        <div className="sa-md-detail d-grid gap-3 sa-anim-slide" key={doc}>
          <SectionCard icon={currentDoc.icon} title={currentDoc.label}
                       description="Los cambios se publican en la web al guardar.">
            <div className="d-grid gap-3">
              <div data-tour="legal-lang">
                <Tabs ariaLabel="Idioma" value={lang} onChange={v => changeLang(v as Lang)}
                      items={LANGS.map(l => ({ value: l, label: LANG_LABEL[l] }))} />
              </div>

              {loadErr && (
                <div className="sa-note bx-tone-bad" role="alert">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
                </div>
              )}

              {loading ? (
                <div className="d-grid gap-3">
                  <Skeleton height={38} />
                  <Skeleton height={320} />
                </div>
              ) : (
                <>
                  <div className="bx-form-grid">
                    <Field label="Título" help="Encabezado de la página legal.">
                      <input className="form-control" value={content.title}
                             onChange={e => update('title', e.target.value)} />
                    </Field>
                    <Field label="Vigente desde" help="Si cambias el texto y no esta fecha, se publica con la de hoy.">
                      <input className="form-control" type="date" value={content.updatedAt}
                             onChange={e => update('updatedAt', e.target.value)} />
                    </Field>
                  </div>

                  <div className="bx-field" data-tour="legal-editor">
                    <span className="bx-field-label">Contenido</span>
                    <RichTextEditor
                      value={content.html}
                      onChange={html => update('html', html)}
                      minHeight={420}
                      placeholder="Escribe aquí el contenido legal…"
                    />
                    <p className="bx-field-help">Usa «Título 2» para cada apartado: así se lee mejor en el celular.</p>
                  </div>
                </>
              )}
            </div>
          </SectionCard>

          <SaveBar dirty={dirty} saving={saving} onSave={save}
                   onDiscard={() => setContent(original)}
                   saveText={`Publicar ${lang.toUpperCase()}`} />
        </div>
      </div>
    </Page>
  );
}
