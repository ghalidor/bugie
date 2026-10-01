import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';

const LANGS = ['es', 'en', 'pt'] as const;
type Lang = typeof LANGS[number];

interface Section { sectionId: string; sectionKey: string; sortOrder: number; contentJson: string; }

const SECTIONS = [
  { key: 'hero',          label: 'Hero',         icon: 'fa-star',             group: 'home'  },
  { key: 'features',      label: 'Features',     icon: 'fa-th-large',         group: 'home'  },
  { key: 'stats',         label: 'Estadísticas', icon: 'fa-chart-bar',        group: 'home'  },
  { key: 'testimonials',  label: 'Testimonios',  icon: 'fa-comments',         group: 'home'  },
  { key: 'cta',           label: 'CTA',          icon: 'fa-bullhorn',         group: 'home'  },
  { key: 'company',       label: 'Empresa',      icon: 'fa-building',         group: 'pages' },
  { key: 'safety',        label: 'Seguridad',    icon: 'fa-shield-halved',    group: 'pages' },
  { key: 'contact',       label: 'Contacto',     icon: 'fa-envelope',         group: 'pages' },
  { key: 'footer',        label: 'Footer',       icon: 'fa-grip-lines',       group: 'global'},
  { key: 'auth',          label: 'Auth Panel',   icon: 'fa-lock',             group: 'auth'  },
  { key: 'auth_login',    label: 'Login',        icon: 'fa-right-to-bracket', group: 'auth'  },
  { key: 'auth_register', label: 'Registro',     icon: 'fa-user-plus',        group: 'auth'  },
];

const GROUPS = [
  { key: 'home',   label: 'Página principal', icon: 'fa-house'      },
  { key: 'pages',  label: 'Páginas internas', icon: 'fa-file-lines' },
  { key: 'global', label: 'Global',           icon: 'fa-globe'      },
  { key: 'auth',   label: 'Autenticación',    icon: 'fa-lock'       },
];

export default function LandingManager() {
  const [lang,      setLang]      = useState<Lang>('es');
  const [sections,  setSections]  = useState<Section[]>([]);
  const [group,     setGroup]     = useState('home');
  const [selected,  setSelected]  = useState<string | null>(null);
  const [json,      setJson]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null); setSelected(null); setJson('');
    fetch(`${import.meta.env.VITE_API_LANDING}/landing?lang=${lang}`)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(d => setSections(d.sections ?? []))
      .catch(e => setError(`No se pudo conectar — ${e.message}`))
      .finally(() => setLoading(false));
  }, [lang]);

  function select(key: string) {
    const s = sections.find(s => s.sectionKey === key);
    const content = s?.contentJson ?? '{}';
    setSelected(key); setJsonError(null); setSuccess(false);
    try { setJson(JSON.stringify(JSON.parse(content), null, 2)); }
    catch { setJson(content); }
  }

  function handleChange(v: string) {
    setJson(v);
    try { JSON.parse(v); setJsonError(null); }
    catch (e: any) { setJsonError(e.message); }
  }

  async function save() {
    if (!selected || jsonError) return;
    setSaving(true); setSuccess(false); setError(null);
    try {
      const token = localStorage.getItem('bugie_token') ?? '';
      const res = await fetch(`${import.meta.env.VITE_API_LANDING}/landing/section`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sectionKey: selected, lang, contentJson: json }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as any).error ?? `Error ${res.status}`); }
      setSections(prev => prev.map(s => s.sectionKey === selected ? { ...s, contentJson: json } : s));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) { setError(`No se pudo guardar: ${e.message}`); }
    finally { setSaving(false); }
  }

  const groupSections = SECTIONS.filter(s => s.group === group);
  const selectedMeta  = SECTIONS.find(s => s.key === selected);

  return (
    <>
      <PageHeader title="Gestor de Landing" subtitle="Edita el contenido de cada sección por idioma." icon="fa-solid fa-paintbrush" />

      {/* Barra superior */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        {/* Tabs grupo */}
        <div className="d-flex gap-1 p-1 bugie-card" style={{ borderRadius: 12 }}>
          {GROUPS.map(g => (
            <button key={g.key} type="button"
              onClick={() => { setGroup(g.key); setSelected(null); setJson(''); }}
              style={{
                fontSize: '0.8rem', padding: '6px 16px', borderRadius: 999, cursor: 'pointer',
                border: 'none',
                background: g.key === group ? 'var(--bugie-primary)' : 'transparent',
                color: g.key === group ? '#fff' : 'var(--bugie-text)',
                fontWeight: g.key === group ? 700 : 400,
              }}>
              <i className={`fa-solid ${g.icon} me-1`} style={{ fontSize: '0.7rem' }} />
              {g.label}
            </button>
          ))}
        </div>
        {/* Idioma */}
        <div className="d-flex align-items-center gap-2">
          <span className="small bugie-muted">Idioma</span>
          {LANGS.map(l => (
            <button key={l} type="button" onClick={() => setLang(l)}
              style={{
                padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${lang === l ? 'var(--bugie-primary)' : 'var(--bugie-border)'}`,
                background: lang === l ? 'var(--bugie-primary)' : 'transparent',
                color: lang === l ? '#fff' : 'var(--bugie-text)',
                fontSize: '0.8rem', fontWeight: lang === l ? 700 : 400,
              }}>
              {l === 'es' ? '🇵🇪 ES' : l === 'en' ? '🇺🇸 EN' : '🇧🇷 PT'}
            </button>
          ))}
          {loading && <span className="spinner-border spinner-border-sm" />}
        </div>
      </div>

      {error && <div className="alert alert-danger small mb-3"><i className="fa-solid fa-triangle-exclamation me-2" />{error}</div>}

      {/* Grid de cards por sección */}
      <div className="row g-3 mb-4">
        {groupSections.map(s => {
          const active  = selected === s.key;
          const hasData = sections.some(sec => sec.sectionKey === s.key);
          return (
            <div key={s.key} className="col-6 col-sm-4 col-md-3 col-lg-2">
              <button type="button" onClick={() => select(s.key)} className="bugie-card w-100 p-3 text-center"
                style={{
                  border: active ? '2px solid #818cf8' : undefined,
                  background: active ? '#818cf811' : undefined,
                  cursor: 'pointer', position: 'relative',
                }}>
                {/* Dot */}
                <span style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 7, height: 7, borderRadius: '50%',
                  background: hasData ? '#34d399' : '#94a3b8',
                  display: 'inline-block',
                }} />
                {/* Ícono */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, margin: '0 auto 8px',
                  background: active ? '#818cf822' : undefined,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} className={active ? '' : 'bugie-mini-icon'}>
                  <i className={`fa-solid ${s.icon}`} style={{ color: active ? '#818cf8' : undefined }} />
                </div>
                <div className="small fw-semibold" style={{ color: active ? '#818cf8' : 'var(--bugie-text)', fontSize: '0.78rem' }}>
                  {s.label}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Editor */}
      {selected ? (
        <div className="bugie-card" style={{ overflow: 'hidden' }}>
          {/* Header */}
          <div className="bugie-card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#818cf822', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`fa-solid ${selectedMeta?.icon}`} style={{ color: '#818cf8', fontSize: '0.82rem' }} />
              </div>
              <span className="fw-semibold" style={{ color: 'var(--bugie-text)' }}>{selectedMeta?.label}</span>
              <span className="badge rounded-pill" style={{ background: '#818cf822', color: '#818cf8', fontSize: '0.68rem' }}>
                {lang.toUpperCase()}
              </span>
              {!sections.some(s => s.sectionKey === selected) && (
                <span className="badge rounded-pill" style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: '0.68rem' }}>No en BD</span>
              )}
            </div>
            <div className="d-flex gap-2">
              <button type="button"
                onClick={() => { try { setJson(JSON.stringify(JSON.parse(json), null, 2)); setJsonError(null); } catch {} }}
                style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid var(--bugie-border)', background: 'transparent', color: 'var(--bugie-text)', fontSize: '0.78rem', cursor: 'pointer' }}>
                <i className="fa-solid fa-code me-1" />Formatear
              </button>
              <button type="button"
                onClick={() => { setSelected(null); setJson(''); }}
                style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid var(--bugie-border)', background: 'transparent', color: 'var(--bugie-text)', fontSize: '0.78rem', cursor: 'pointer' }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>

          <div className="bugie-card-body d-flex flex-column gap-3">
            <div className="alert alert-info small py-2 mb-0">
              <i className="fa-solid fa-circle-info me-1" />
              Edita el JSON y pulsa <strong>Guardar</strong>. El cambio se refleja en la landing en tiempo real.
            </div>

            <textarea className="form-control font-monospace" rows={20} value={json}
              onChange={e => handleChange(e.target.value)} spellCheck={false}
              style={{ fontSize: '0.8rem', lineHeight: 1.7, resize: 'vertical' }} />

            {jsonError && (
              <div className="small" style={{ color: '#f87171' }}>
                <i className="fa-solid fa-xmark me-1" />{jsonError}
              </div>
            )}

            <div className="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" className="btn btn-bugie text-white rounded-pill px-4"
                onClick={save} disabled={saving || !!jsonError}>
                {saving
                  ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                  : <><i className="fa-solid fa-floppy-disk me-2" />Guardar</>}
              </button>
              <button type="button" className="btn btn-bugie-outline rounded-pill"
                onClick={() => select(selected)} disabled={saving}>
                <i className="fa-solid fa-rotate-left me-1" />Descartar
              </button>
              {success && (
                <span className="small" style={{ color: '#34d399' }}>
                  <i className="fa-solid fa-circle-check me-1" />Guardado correctamente
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bugie-card p-5 text-center bugie-muted">
          <i className="fa-solid fa-hand-pointer fa-2x mb-3 d-block" />
          <div className="fw-semibold">Selecciona una sección para editar</div>
        </div>
      )}
    </>
  );
}