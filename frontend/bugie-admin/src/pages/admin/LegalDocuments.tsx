import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import RichTextEditor from '../../components/RichTextEditor';

const LANGS = ['es', 'en', 'pt'] as const;
type Lang = typeof LANGS[number];

const DOCUMENTS = [
  { key: 'terms',   label: 'Términos y Condiciones', icon: 'fa-file-contract'  },
  { key: 'privacy', label: 'Política de Privacidad', icon: 'fa-user-shield'    },
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

const LANG_LABEL: Record<Lang, string> = { es: 'Español', en: 'English', pt: 'Português' };

interface Section {
  sectionId:   string;
  sectionKey:  string;
  sortOrder:   number;
  contentJson: string;
}

export default function LegalDocuments() {
  const [doc,      setDoc]      = useState<DocKey>('terms');
  const [lang,     setLang]     = useState<Lang>('es');
  const [content,  setContent]  = useState<LegalContent>(EMPTY);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  // Cargar contenido cuando cambia documento o idioma
  useEffect(() => {
    setLoading(true); setError(null); setSuccess(false);
    fetch(`${import.meta.env.VITE_API_LANDING}/landing?lang=${lang}`)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(data => {
        const sections: Section[] = data.sections ?? [];
        const section = sections.find(s => s.sectionKey === doc);
        if (!section) {
          // Sección no existe todavía en BD — usar plantilla vacía
          setContent({
            ...EMPTY,
            title: doc === 'terms' ? 'Términos y Condiciones' : 'Política de Privacidad',
          });
          return;
        }
        try {
          const parsed = JSON.parse(section.contentJson);
          setContent({ ...EMPTY, ...parsed });
        } catch {
          setContent({ ...EMPTY, html: section.contentJson });
        }
      })
      .catch(e => setError(`No se pudo cargar: ${e.message}`))
      .finally(() => setLoading(false));
  }, [doc, lang]);

  function update<K extends keyof LegalContent>(key: K, value: LegalContent[K]) {
    setContent(prev => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function save() {
    setSaving(true); setError(null); setSuccess(false);
    try {
      const token = localStorage.getItem('bugie_token') ?? '';
      const payload = {
        sectionKey: doc,
        lang,
        contentJson: JSON.stringify({
          ...content,
          updatedAt: content.updatedAt || new Date().toISOString().slice(0, 10),
        }),
      };
      const res = await fetch(`${import.meta.env.VITE_API_LANDING}/landing/section`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Error ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const currentDoc = DOCUMENTS.find(d => d.key === doc)!;

  return (
    <>
      <PageHeader
        title="Documentos legales"
        subtitle="Edita Términos y Condiciones y Política de Privacidad. Soporta los 3 idiomas configurados."
        icon="fa-gavel"
      />

      <div className="row g-3">

        {/* Selector de documento */}
        <div className="col-lg-3">
          <div className="bugie-card p-3">
            <div className="small text-uppercase fw-bold bugie-muted mb-3">Documentos</div>
            <div className="d-grid gap-2">
              {DOCUMENTS.map(d => (
                <button
                  key={d.key}
                  type="button"
                  className={`bugie-sidebar-link ${doc === d.key ? 'active' : ''}`}
                  onClick={() => setDoc(d.key)}
                  style={{ textAlign: 'left' }}
                >
                  <i className={`fa-solid ${d.icon} bugie-sidebar-icon`} />
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="col-lg-9">
          <div className="bugie-card p-3 p-md-4">

            {/* Cabecera con tabs de idioma */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
              <div>
                <h5 className="fw-bold mb-0">
                  <i className={`fa-solid ${currentDoc.icon} me-2`} />
                  {currentDoc.label}
                </h5>
                <small className="bugie-muted">Editando idioma: <strong>{LANG_LABEL[lang]}</strong></small>
              </div>

              <div className="btn-group" role="group" aria-label="Idioma">
                {LANGS.map(l => (
                  <button
                    key={l}
                    type="button"
                    className={`btn btn-sm ${l === lang ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
                    onClick={() => setLang(l)}
                  >
                    {LANG_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>

            {error   && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
            {success && <div className="alert alert-success py-2 small mb-3">✓ Guardado correctamente</div>}

            {loading ? (
              <div className="text-center py-5 bugie-muted">
                <i className="fa-solid fa-circle-notch fa-spin me-2" />
                Cargando...
              </div>
            ) : (
              <>
                {/* Campos del documento */}
                <div className="row g-3 mb-3">
                  <div className="col-md-8">
                    <label className="form-label small fw-bold">Título</label>
                    <input
                      className="form-control"
                      value={content.title}
                      onChange={e => update('title', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">Última actualización</label>
                    <input
                      className="form-control"
                      type="date"
                      value={content.updatedAt}
                      onChange={e => update('updatedAt', e.target.value)}
                    />
                  </div>
                </div>

                <label className="form-label small fw-bold">Contenido</label>
                <RichTextEditor
                  value={content.html}
                  onChange={html => update('html', html)}
                  minHeight={500}
                  placeholder="Escribe aquí el contenido legal..."
                />

                {/* Acciones */}
                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-bugie text-white"
                    disabled={saving}
                    onClick={save}
                  >
                    {saving
                      ? (<><i className="fa-solid fa-circle-notch fa-spin me-2" />Guardando...</>)
                      : (<><i className="fa-solid fa-floppy-disk me-2" />Guardar</>)
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}