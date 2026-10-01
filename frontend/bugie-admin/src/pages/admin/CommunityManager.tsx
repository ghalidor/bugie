import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';

interface Article {
  id: string; slug: string; tag: string;
  title: string; summary: string;
  lang: string; isPublished: boolean; publishedAt: string;
}

interface ArticlesPagedResponse {
  items: Article[];
  page: number;
  pageSize: number;
  total: number;
}

interface ArticlesStatsResponse {
  total: number;
  published: number;
  hidden: number;
}

const TAGS_ES = ['Producto', 'Seguridad', 'Tecnología', 'Empresa', 'Arquitectura'];
const TAGS_EN = ['Product', 'Safety', 'Technology', 'Company'];

const TAG_COLOR: Record<string, string> = {
  Producto: 'primary', Seguridad: 'danger', Tecnología: 'info', Empresa: 'secondary',
  Product: 'primary',  Safety: 'danger',    Technology: 'info', Company: 'secondary',
};

const PAGE_SIZE = 25;
const EMPTY_FORM = { slug: '', tag: 'Producto', title: '', summary: '', lang: 'es' };

export default function CommunityManager() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [stats,    setStats]    = useState<ArticlesStatsResponse>({ total: 0, published: 0, hidden: 0 });
  const [loading,  setLoading]  = useState(true);
  const [lang,     setLang]     = useState('es');
  // Filtros: búsqueda, tag, estado publicación.
  const [search,   setSearch]   = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [tagFilter,     setTagFilter]     = useState<string>('all');
  const [pubFilter,     setPubFilter]     = useState<'all' | 'published' | 'hidden'>('all');
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [editing,  setEditing]  = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Debounce search
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search]);

  // Al cambiar idioma o filtros, volver a página 1
  useEffect(() => { setPage(1); setTagFilter('all'); }, [lang]);
  useEffect(() => { setPage(1); }, [tagFilter, pubFilter]);

  // Cargar al cambiar página / lang / filtros
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lang, page, searchDebounced, tagFilter, pubFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        lang,
      });
      if (searchDebounced.trim())  params.append('search', searchDebounced.trim());
      if (tagFilter !== 'all')     params.append('tag', tagFilter);
      if (pubFilter === 'published') params.append('published', 'true');
      if (pubFilter === 'hidden')    params.append('published', 'false');

      const token = localStorage.getItem('bugie_token') ?? '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Lista paginada
      const listRes = await fetch(
        `${import.meta.env.VITE_API_LANDING}/landing/news/paged?${params.toString()}`,
        { headers });
      if (!listRes.ok) throw new Error(`Error ${listRes.status}`);
      const data: ArticlesPagedResponse = await listRes.json();
      setArticles(data.items ?? []);
      setTotal(data.total ?? 0);

      // Stats (sin paginación, mismos filtros excepto pubFilter)
      const statsParams = new URLSearchParams({ lang });
      if (searchDebounced.trim()) statsParams.append('search', searchDebounced.trim());
      if (tagFilter !== 'all')    statsParams.append('tag', tagFilter);
      const statsRes = await fetch(
        `${import.meta.env.VITE_API_LANDING}/landing/news/stats?${statsParams.toString()}`,
        { headers });
      if (statsRes.ok) {
        const s: ArticlesStatsResponse = await statsRes.json();
        setStats(s);
      }
    } catch (err: any) {
      setError(err.message ?? 'No se pudo cargar las publicaciones.');
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  const set = (f: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }));

  function startNew() {
    setForm({ ...EMPTY_FORM, lang });
    setEditing(null);
    setShowForm(true);
    setError(null);
  }

  function startEdit(a: Article) {
    setForm({ slug: a.slug, tag: a.tag, title: a.title, summary: a.summary, lang: a.lang });
    setEditing(a.id);
    setShowForm(true);
    setError(null);
  }

  function cancel() { setShowForm(false); setEditing(null); setError(null); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(false);
    const token = localStorage.getItem('bugie_token') ?? '';

    try {
      const url    = editing
        ? `${import.meta.env.VITE_API_LANDING}/landing/news/${editing}`
        : `${import.meta.env.VITE_API_LANDING}/landing/news`;
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? (b as any).message ?? `Error ${res.status}`);
      }

      setSuccess(true);
      setShowForm(false);
      setEditing(null);
      load();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  async function togglePublish(a: Article) {
    const token = localStorage.getItem('bugie_token') ?? '';
    await fetch(`${import.meta.env.VITE_API_LANDING}/landing/news/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...a, isPublished: !a.isPublished }),
    });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx   = Math.min(page * PAGE_SIZE, total);

  // Tags disponibles según idioma
  const tagsForLang = lang === 'es' ? TAGS_ES : TAGS_EN;

  return (
    <>
      <PageHeader
        title="Gestión de Comunidad"
        subtitle="Publicaciones que aparecen en la sección de comunidad de la landing."
        icon="fa-solid fa-users"
        actions={
          <button className="btn btn-bugie text-white" type="button" onClick={startNew}>
            <i className="fa-solid fa-plus me-2" />Nueva publicación
          </button>
        }
      />

      {/* KPIs */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Total',       value: stats.total,     color: '#818cf8', icon: 'fa-newspaper'    },
          { label: 'Publicadas',  value: stats.published, color: '#34d399', icon: 'fa-eye'          },
          { label: 'Ocultas',     value: stats.hidden,    color: '#94a3b8', icon: 'fa-eye-slash'    },
        ].map(k => (
          <div className="col-md-4" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading ? '…' : k.value.toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selector de idioma + búsqueda */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        {[['es','🇵🇪 Español'],['en','🇺🇸 English']].map(([l, label]) => (
          <button key={l} type="button" onClick={() => setLang(l)}
            className={`btn btn-sm ${lang === l ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}>
            {label}
          </button>
        ))}
        <div className="position-relative" style={{ width: 240 }}>
          <i className="fa-solid fa-magnifying-glass position-absolute"
             style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--bugie-muted)', fontSize: '0.8rem' }} />
          <input className="form-control form-control-sm ps-4" placeholder="Buscar título o resumen…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Filtros de tag y estado */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <span className="small bugie-muted me-1">Tag:</span>
        <button className={`btn btn-sm rounded-pill ${tagFilter === 'all' ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
          onClick={() => setTagFilter('all')}>Todos</button>
        {tagsForLang.map(t => (
          <button key={t}
            className={`btn btn-sm rounded-pill ${tagFilter === t ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
            onClick={() => setTagFilter(t)}>
            {t}
          </button>
        ))}
        <span className="small bugie-muted ms-3 me-1">Estado:</span>
        {[
          { key: 'all',       label: 'Todos'      },
          { key: 'published', label: 'Publicadas' },
          { key: 'hidden',    label: 'Ocultas'    },
        ].map(f => (
          <button key={f.key}
            className={`btn btn-sm rounded-pill ${pubFilter === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
            onClick={() => setPubFilter(f.key as any)}>
            {f.label}
          </button>
        ))}
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto" onClick={load}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {success && (
        <div className="alert alert-success small py-2 mb-3">
          <i className="fa-solid fa-circle-check me-2" />Guardado correctamente.
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="bugie-card mb-3">
          <div className="bugie-card-header">
            {editing ? 'Editar publicación' : 'Nueva publicación'}
          </div>
          <div className="bugie-card-body">
            <form onSubmit={save} className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Título <span className="text-danger">*</span></label>
                <input className="form-control" value={form.title} onChange={set('title')} required />
              </div>
              <div className="col-md-3">
                <label className="form-label">Tag</label>
                <select className="form-select" value={form.tag} onChange={set('tag')}>
                  {tagsForLang.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Slug <span className="text-danger">*</span></label>
                <input className="form-control" value={form.slug} onChange={set('slug')}
                  placeholder="mi-articulo-2026" required />
              </div>
              <div className="col-12">
                <label className="form-label">Resumen <span className="text-danger">*</span></label>
                <textarea className="form-control" rows={3} value={form.summary}
                  onChange={set('summary')} required minLength={20} />
              </div>
              {error && (
                <div className="col-12">
                  <div className="alert alert-danger small py-2 mb-0">
                    <i className="fa-solid fa-circle-exclamation me-2" />{error}
                  </div>
                </div>
              )}
              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-bugie text-white" disabled={saving}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                          : <><i className="fa-solid fa-floppy-disk me-2" />Guardar</>}
                </button>
                <button type="button" className="btn btn-bugie-outline" onClick={cancel}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && !showForm && (
        <div className="alert alert-danger small mb-3">{error}</div>
      )}

      {/* Lista */}
      <div className="bugie-card">
        <div className="bugie-card-header">
          Publicaciones — {lang === 'es' ? 'Español' : 'English'}
          <span className="badge rounded-pill ms-2" style={{ background: 'var(--bugie-primary)', color: '#fff' }}>
            {total}
          </span>
        </div>
        <div className="bugie-card-body p-0">
          {loading ? (
            <div className="d-flex justify-content-center py-4">
              <span className="spinner-border" />
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-4 bugie-muted small">
              <i className="fa-solid fa-users fa-2x mb-3 d-block" />
              No hay publicaciones que coincidan con los filtros.
            </div>
          ) : (
            articles.map((a, i) => (
              <div key={a.id} className="bugie-list-item"
                style={{ borderBottom: i < articles.length - 1 ? '1px solid var(--bugie-border)' : 'none', padding: '14px 20px' }}>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className={`badge text-bg-${TAG_COLOR[a.tag] ?? 'secondary'}`}>{a.tag}</span>
                    {!a.isPublished && <span className="badge text-bg-secondary">Oculto</span>}
                  </div>
                  <div className="fw-semibold">{a.title}</div>
                  <div className="small bugie-muted text-truncate">{a.summary}</div>
                  <div className="small bugie-muted mt-1">
                    {new Date(a.publishedAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
                <div className="d-flex gap-2 ms-3">
                  <button className="btn btn-sm btn-bugie-outline" onClick={() => startEdit(a)} title="Editar">
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button className="btn btn-sm btn-bugie-outline" onClick={() => togglePublish(a)}
                    title={a.isPublished ? 'Ocultar' : 'Publicar'}>
                    <i className={`fa-solid fa-${a.isPublished ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Paginación */}
        {!loading && articles.length > 0 && (
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3"
               style={{ borderTop: '1px solid var(--bugie-border)' }}>
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{total.toLocaleString('es-PE')}</strong>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(1)} disabled={page === 1}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">
                Página {page} de {totalPages}
              </span>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
