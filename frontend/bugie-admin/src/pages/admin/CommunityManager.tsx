import { useEffect, useRef, useState } from 'react';
import { API, ApiError, apiFetch } from '../../state/api';
import {
  Column, DataTable, Drawer, Field, FilterBar, Page, Pagination, SectionCard, StatCard, StatGrid,
  Select, StatusBadge, Tabs, Tone, useConfirm, useDebouncedValue, useToast,
} from '../../components/ui';
import './siteAdmin.scss';

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

const TAG_TONE: Record<string, Tone> = {
  Producto: 'primary', Seguridad: 'bad', Tecnología: 'info', Empresa: 'neutral', Arquitectura: 'neutral',
  Product: 'primary',  Safety: 'bad',    Technology: 'info', Company: 'neutral',
};

const LANG_TABS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
];

const PAGE_SIZE = 25;
type Form = { slug: string; tag: string; title: string; summary: string; lang: string };
const emptyForm = (lang: string): Form => ({ slug: '', tag: lang === 'es' ? TAGS_ES[0] : TAGS_EN[0], title: '', summary: '', lang });

const API_NEWS = `${API.landing}/landing/news`;
const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export default function CommunityManager() {
  const toast   = useToast();
  const confirm = useConfirm();

  const [articles, setArticles] = useState<Article[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [stats,    setStats]    = useState<ArticlesStatsResponse>({ total: 0, published: 0, hidden: 0 });
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);
  const [lang,     setLang]     = useState('es');
  // Filtros: búsqueda, tag y estado de publicación.
  const [search,    setSearch]    = useState('');
  const searchDebounced = useDebouncedValue(search, 300);
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [pubFilter, setPubFilter] = useState<'all' | 'published' | 'hidden'>('all');

  // Drawer de crear / editar
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form,       setForm]       = useState<Form>(emptyForm('es'));
  const [initial,    setInitial]    = useState<Form>(emptyForm('es'));
  const [editing,    setEditing]    = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState<string | null>(null);

  // Al cambiar idioma, el tag elegido deja de existir: se limpia.
  useEffect(() => { setTagFilter('all'); }, [lang]);

  // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces); reqId descarta respuestas viejas.
  const filterKey = `${lang}|${searchDebounced.trim()}|${tagFilter}|${pubFilter}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);
  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  async function load() {
    const id = ++reqId.current;
    setLoading(true);
    setLoadErr(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), lang });
      if (searchDebounced.trim())    params.append('search', searchDebounced.trim());
      if (tagFilter !== 'all')       params.append('tag', tagFilter);
      if (pubFilter === 'published') params.append('published', 'true');
      if (pubFilter === 'hidden')    params.append('published', 'false');

      // Lista paginada
      const data = await apiFetch<ArticlesPagedResponse>(`${API_NEWS}/paged?${params.toString()}`);
      if (id !== reqId.current) return;
      setArticles(data.items ?? []);
      setTotal(data.total ?? 0);

      // Totales (mismos filtros salvo el de estado)
      const statsParams = new URLSearchParams({ lang });
      if (searchDebounced.trim()) statsParams.append('search', searchDebounced.trim());
      if (tagFilter !== 'all')    statsParams.append('tag', tagFilter);
      const st = await apiFetch<ArticlesStatsResponse>(`${API_NEWS}/stats?${statsParams.toString()}`).catch(() => null);
      if (st && id === reqId.current) setStats(st);
    } catch (err) {
      if (id !== reqId.current) return;
      setLoadErr(errText(err, 'No se pudieron cargar las publicaciones.'));
      setArticles([]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  const tagsForLang = lang === 'es' ? TAGS_ES : TAGS_EN;
  const formTags = form.lang === 'es' ? TAGS_ES : TAGS_EN;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const setField = (f: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }));

  function startNew() {
    const f = emptyForm(lang);
    setForm(f); setInitial(f);
    setEditing(null); setFormErr(null);
    setDrawerOpen(true);
  }

  function startEdit(a: Article) {
    const f = { slug: a.slug, tag: a.tag, title: a.title, summary: a.summary, lang: a.lang };
    setForm(f); setInitial(f);
    setEditing(a.id); setFormErr(null);
    setDrawerOpen(true);
  }

  async function closeDrawer() {
    if (saving) return;
    if (dirty && !(await confirm({
      title: '¿Cerrar sin guardar?', message: 'Los cambios de esta publicación se perderán.',
      confirmText: 'Cerrar sin guardar', cancelText: 'Seguir editando', tone: 'warning',
    }))) return;
    setDrawerOpen(false);
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.title.trim() || !form.slug.trim() || form.summary.trim().length < 20) {
      setFormErr('Completa título, slug y un resumen de al menos 20 caracteres.');
      return;
    }
    setSaving(true); setFormErr(null);
    try {
      const url    = editing ? `${API_NEWS}/${editing}` : API_NEWS;
      const method = editing ? 'PUT' : 'POST';
      await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      toast.success(editing ? 'Publicación actualizada.' : 'Publicación creada.');
      setDrawerOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      setFormErr(errText(err, 'No se pudo guardar la publicación.'));
    } finally { setSaving(false); }
  }

  async function togglePublish(a: Article) {
    const ok = await confirm(a.isPublished
      ? { title: '¿Ocultar de la web?', message: <>«<strong>{a.title}</strong>» dejará de verse en la sección Comunidad. Podrás volver a publicarla.</>,
          confirmText: 'Ocultar', tone: 'warning' }
      : { title: '¿Publicar en la web?', message: <>«<strong>{a.title}</strong>» se verá en la sección Comunidad de la web.</>,
          confirmText: 'Publicar' });
    if (!ok) return;
    try {
      await apiFetch(`${API_NEWS}/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...a, isPublished: !a.isPublished }),
      });
      toast.success(a.isPublished ? 'La publicación ya no se ve en la web.' : 'La publicación ya se ve en la web.');
      load();
    } catch (err) {
      toast.error(`No se pudo cambiar el estado: ${errText(err, 'vuelve a intentarlo.')}`);
    }
  }

  // Filtros activos: tema, estado y búsqueda (lo mismo que borra "Limpiar filtros").
  const activeFilters = (tagFilter !== 'all' ? 1 : 0) + (pubFilter !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);

  const columns: Column<Article>[] = [
    {
      key: 'title', header: 'Publicación', priority: 1,
      render: a => (
        <div style={{ minWidth: 0 }}>
          <div className="fw-semibold">{a.title}</div>
          <div className="small bugie-muted text-truncate" style={{ maxWidth: '48ch' }}>{a.summary}</div>
        </div>
      ),
    },
    { key: 'tag', header: 'Tema', priority: 1, render: a => <StatusBadge size="sm" tone={TAG_TONE[a.tag] ?? 'neutral'}>{a.tag}</StatusBadge> },
    {
      key: 'status', header: 'Estado', priority: 1,
      render: a => a.isPublished
        ? <StatusBadge size="sm" tone="ok" icon="fa-eye">Publicada</StatusBadge>
        : <StatusBadge size="sm" tone="neutral" icon="fa-eye-slash">Oculta</StatusBadge>,
    },
    {
      key: 'date', header: 'Fecha', priority: 2,
      render: a => new Date(a.publishedAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' }),
    },
  ];

  return (
    <Page
      title="Comunidad"
      subtitle="Publicaciones de la sección Comunidad de la web."
      icon="fa-users"
      helpKey="community"
      actions={[
        { label: 'Nueva publicación', icon: 'fa-plus', variant: 'primary', onClick: startNew },
        { label: 'Actualizar', icon: 'fa-rotate-right', variant: 'secondary', onClick: load, loading },
      ]}
    >
      <StatGrid tourId="community-stats">
        <StatCard label="Total" value={stats.total.toLocaleString('es-PE')} icon="fa-newspaper" tone="primary" loading={loading} hint="Con los filtros actuales" />
        <StatCard label="Publicadas" value={stats.published.toLocaleString('es-PE')} icon="fa-eye" tone="ok" loading={loading} hint="Se ven en la web" onClick={() => setPubFilter('published')} />
        <StatCard label="Ocultas" value={stats.hidden.toLocaleString('es-PE')} icon="fa-eye-slash" tone="neutral" loading={loading} hint="Solo las ves tú" onClick={() => setPubFilter('hidden')} />
      </StatGrid>

      <div data-tour="community-lang">
        <Tabs ariaLabel="Idioma" items={LANG_TABS} value={lang} onChange={setLang} />
      </div>

      <SectionCard flush tourId="community-list">
        <div className="p-3" data-tour="community-filters">
          <FilterBar
            search={search} onSearchChange={setSearch} searchPlaceholder="Buscar título o resumen…"
            chips={[
              { value: 'all', label: 'Todas' },
              { value: 'published', label: 'Publicadas', count: stats.published },
              { value: 'hidden', label: 'Ocultas', count: stats.hidden },
            ]}
            chip={pubFilter} onChipChange={v => setPubFilter(v as typeof pubFilter)}
            activeCount={activeFilters} onClear={() => { setTagFilter('all'); setPubFilter('all'); setSearch(''); }}
          >
            <div className="bx-chips" role="group" aria-label="Tema">
              <button type="button" className="bx-chip" aria-pressed={tagFilter === 'all'} onClick={() => setTagFilter('all')}>Todos los temas</button>
              {tagsForLang.map(t => (
                <button key={t} type="button" className="bx-chip" aria-pressed={tagFilter === t} onClick={() => setTagFilter(t)}>{t}</button>
              ))}
            </div>
          </FilterBar>
        </div>

        {loadErr && (
          <div className="px-3 pb-3">
            <div className="sa-note bx-tone-bad" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
            </div>
          </div>
        )}

        <DataTable
          columns={columns} rows={articles} rowKey={a => a.id} loading={loading}
          onRowClick={startEdit}
          mobileTitle={a => a.title}
          mobileSubtitle={a => a.summary}
          empty={{ icon: 'fa-users', title: 'Sin publicaciones', text: 'No hay publicaciones que coincidan con los filtros.' }}
          actions={a => [
            { label: 'Editar', icon: 'fa-pen', onClick: () => startEdit(a) },
            { label: a.isPublished ? 'Ocultar de la web' : 'Publicar en la web', icon: a.isPublished ? 'fa-eye-slash' : 'fa-eye', onClick: () => togglePublish(a) },
          ]}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </SectionCard>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        size="md"
        title={editing ? 'Editar publicación' : 'Nueva publicación'}
        description={`Idioma: ${form.lang === 'es' ? 'Español' : 'Inglés'}`}
        footer={
          <>
            <button type="button" className="btn btn-bugie-outline" onClick={closeDrawer} disabled={saving}>Cancelar</button>
            <button type="submit" form="community-form" className="btn btn-bugie" disabled={saving || !dirty}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Guardando…</>
                      : <><i className="fa-solid fa-floppy-disk me-2" aria-hidden="true" />Guardar</>}
            </button>
          </>
        }
      >
        <form id="community-form" onSubmit={save} className="d-grid gap-3">
          <Field label="Título" required help="Se muestra como encabezado de la tarjeta.">
            <input className="form-control" value={form.title} onChange={setField('title')} maxLength={200} />
          </Field>
          <div className="bx-form-grid">
            <Field label="Tema" help="Etiqueta de color en la web.">
              <Select
                value={form.tag}
                onChange={tag => setForm(p => ({ ...p, tag }))}
                options={[
                  ...(!formTags.includes(form.tag) && form.tag ? [form.tag] : []),
                  ...formTags,
                ].map(t => ({ value: t, label: t }))}
              />

            </Field>
            <Field label="Slug" required help="Parte final de la dirección web."
                   helpLong="Solo minúsculas, números y guiones. Ejemplo: nuevo-boton-sos-2026. No lo cambies si ya compartiste el enlace.">
              <input className="form-control" value={form.slug} onChange={setField('slug')} placeholder="mi-articulo-2026" />
            </Field>
          </div>
          <Field label="Resumen" required help={`${form.summary.trim().length} caracteres · mínimo 20.`}>
            <textarea className="form-control" rows={5} value={form.summary} onChange={setField('summary')} />
          </Field>
          {formErr && (
            <div className="sa-note bx-tone-bad" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{formErr}</span>
            </div>
          )}
        </form>
      </Drawer>
    </Page>
  );
}
