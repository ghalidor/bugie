import { useEffect, useRef, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import {
  Drawer, EmptyState, Field, FilterBar, IconButton, Page, SectionCard, Skeleton, StatCard, StatGrid,
  StatusBadge, Switch, Tabs, useConfirm, useToast,
} from '../../components/ui';
import './siteAdmin.scss';

interface FaqItem {
  id: string;
  lang: string;
  category: string;
  question: string;
  answer: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/// Categorías sugeridas. Se puede escribir cualquier otra: esto solo
/// alimenta el autocompletado.
const SUGGESTED_CATEGORIES = ['Pasajeros', 'Conductores', 'Pagos', 'Seguridad', 'Cuenta'];

const LANG_TABS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
];

type PubFilter = 'all' | 'published' | 'hidden';

export default function Faq() {
  const toast   = useToast();
  const confirm = useConfirm();

  const [items,    setItems]    = useState<FaqItem[]>([]);
  const [lang,     setLang]     = useState<'es' | 'en'>('es');
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  const [search,    setSearch]    = useState('');
  const [pubFilter, setPubFilter] = useState<PubFilter>('all');
  const [catFilter, setCatFilter] = useState<string>('all');

  // Drawer: null = cerrado; 'new' = crear; FaqItem = editar.
  const [editing, setEditing] = useState<FaqItem | 'new' | null>(null);

  useEffect(() => { setCatFilter('all'); load(); /* eslint-disable-next-line */ }, [lang]);

  async function load() {
    setLoading(true); setLoadErr(null);
    try {
      const data = await apiFetch<FaqItem[]>(`${API.landing}/landing/faq/admin?lang=${lang}`);
      setItems(data ?? []);
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : 'No se pudieron cargar las preguntas.');
    } finally { setLoading(false); }
  }

  async function togglePublish(item: FaqItem) {
    try {
      await apiFetch(`${API.landing}/landing/faq/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          category:    item.category,
          question:    item.question,
          answer:      item.answer,
          lang:        item.lang,
          isPublished: !item.isPublished,
        }),
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isPublished: !i.isPublished } : i));
      toast.success(item.isPublished ? 'La pregunta ya no se ve en la web.' : 'La pregunta ya se ve en la web.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar la publicación.');
    }
  }

  async function deleteItem(item: FaqItem) {
    const ok = await confirm({
      title: '¿Eliminar esta pregunta?',
      message: <>Se borrará «{item.question}» de forma permanente. Si solo quieres que no se vea, mejor ocúltala.</>,
      tone: 'danger',
      confirmText: 'Eliminar',
      typeToConfirm: 'ELIMINAR',
    });
    if (!ok) return;
    try {
      await apiFetch(`${API.landing}/landing/faq/${item.id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast.success('Pregunta eliminada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar.');
    }
  }

  /// Guarda el nuevo orden de una categoría completa.
  async function saveReorder(category: string, newOrder: FaqItem[]) {
    // Optimista: se reemplaza la categoría en su misma posición (antes se
    // movía al final de la lista y las categorías "saltaban").
    setItems(prev => {
      const out: FaqItem[] = [];
      let inserted = false;
      for (const i of prev) {
        if (i.category !== category) { out.push(i); continue; }
        if (!inserted) { out.push(...newOrder); inserted = true; }
      }
      return out;
    });
    try {
      await apiFetch(`${API.landing}/landing/faq/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ ids: newOrder.map(i => i.id) }),
      });
      toast.success('Orden guardado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el nuevo orden.');
      load(); // Volver al estado real del servidor.
    }
  }

  // Agrupar por categoría (el backend ya las trae ordenadas por categoría y orden).
  const grouped: Record<string, FaqItem[]> = {};
  for (const item of items) (grouped[item.category] ??= []).push(item);
  const categories = Object.keys(grouped);

  // Filtros
  const q = search.trim().toLowerCase();
  const matches = (i: FaqItem) =>
    (pubFilter === 'all' || (pubFilter === 'published') === i.isPublished) &&
    (!q || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q));
  // Reordenar solo tiene sentido viendo la categoría completa.
  const canReorder = !q && pubFilter === 'all';
  const visibleCats = categories
    .filter(c => catFilter === 'all' || c === catFilter)
    .map(c => ({ category: c, items: grouped[c].filter(matches) }))
    .filter(c => c.items.length > 0);

  const published = items.filter(i => i.isPublished).length;
  // Filtros activos: categoría, estado y búsqueda (lo mismo que borra "Limpiar filtros").
  const activeCount = (catFilter !== 'all' ? 1 : 0) + (pubFilter !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);

  return (
    <Page
      title="Preguntas frecuentes"
      subtitle="Las preguntas que aparecen en la sección FAQ de la web."
      icon="fa-circle-question"
      helpKey="faq"
      actions={[
        { label: 'Nueva pregunta', icon: 'fa-plus', variant: 'primary', onClick: () => setEditing('new') },
        { label: 'Actualizar', icon: 'fa-rotate-right', variant: 'secondary', onClick: load, loading },
      ]}
    >
      <StatGrid min={150}>
        <StatCard label="Total" value={items.length} icon="fa-circle-question" tone="primary" loading={loading} />
        <StatCard label="Publicadas" value={published} icon="fa-eye" tone="ok" loading={loading} onClick={() => setPubFilter('published')} />
        <StatCard label="Ocultas" value={items.length - published} icon="fa-eye-slash" tone="neutral" loading={loading} onClick={() => setPubFilter('hidden')} />
        <StatCard label="Categorías" value={categories.length} icon="fa-layer-group" tone="info" loading={loading} />
      </StatGrid>

      <Tabs ariaLabel="Idioma" items={LANG_TABS} value={lang} onChange={v => setLang(v as 'es' | 'en')} />

      <SectionCard>
        <div data-tour="faq-filters">
          <FilterBar
            search={search} onSearchChange={setSearch} searchPlaceholder="Buscar en preguntas y respuestas…"
            chips={[
              { value: 'all', label: 'Todas', count: items.length },
              { value: 'published', label: 'Publicadas', count: published },
              { value: 'hidden', label: 'Ocultas', count: items.length - published },
            ]}
            chip={pubFilter} onChipChange={v => setPubFilter(v as PubFilter)}
            activeCount={activeCount}
            onClear={() => { setCatFilter('all'); setPubFilter('all'); setSearch(''); }}
          >
            <div className="bx-chips" role="group" aria-label="Categoría">
              <button type="button" className="bx-chip" aria-pressed={catFilter === 'all'} onClick={() => setCatFilter('all')}>Todas las categorías</button>
              {categories.map(c => (
                <button key={c} type="button" className="bx-chip" aria-pressed={catFilter === c} onClick={() => setCatFilter(c)}>
                  {c} <span className="count">{grouped[c].length}</span>
                </button>
              ))}
            </div>
          </FilterBar>
        </div>
        <p className="small bugie-muted mt-3 mb-0">
          <i className={`fa-solid ${canReorder ? 'fa-up-down' : 'fa-circle-info'} me-1`} aria-hidden="true" />
          {canReorder
            ? 'Arrastra las preguntas o usa las flechas para cambiar el orden dentro de cada categoría. Se guarda solo.'
            : 'Para cambiar el orden, quita la búsqueda y el filtro de estado.'}
        </p>
      </SectionCard>

      {loadErr && (
        <div className="sa-note bx-tone-bad" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
        </div>
      )}

      <div className="d-grid gap-3" data-tour="faq-list">
        {loading ? (
          <SectionCard><Skeleton height={56} count={4} /></SectionCard>
        ) : items.length === 0 ? (
          <SectionCard>
            <EmptyState icon="fa-circle-question" title="Todavía no hay preguntas"
                        text="Crea la primera para que aparezca en la sección FAQ de la web."
                        action={<button className="btn btn-bugie" onClick={() => setEditing('new')}><i className="fa-solid fa-plus me-2" aria-hidden="true" />Nueva pregunta</button>} />
          </SectionCard>
        ) : visibleCats.length === 0 ? (
          <SectionCard>
            <EmptyState compact title="Sin resultados" text="Ninguna pregunta coincide con los filtros." />
          </SectionCard>
        ) : visibleCats.map(c => (
          <CategoryBlock
            key={c.category}
            category={c.category}
            items={c.items}
            canReorder={canReorder}
            onEdit={setEditing}
            onDelete={deleteItem}
            onTogglePublish={togglePublish}
            onReorder={newOrder => saveReorder(c.category, newOrder)}
          />
        ))}
      </div>

      <FaqDrawer
        item={editing}
        lang={lang}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={created => { setEditing(null); toast.success(created ? 'Pregunta creada.' : 'Cambios guardados.'); load(); }}
      />
    </Page>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Una categoría: lista ordenable (arrastrar o flechas).
// ═════════════════════════════════════════════════════════════════════════
function CategoryBlock({ category, items, canReorder, onEdit, onDelete, onTogglePublish, onReorder }: {
  category: string;
  items: FaqItem[];
  canReorder: boolean;
  onEdit: (i: FaqItem) => void;
  onDelete: (i: FaqItem) => void;
  onTogglePublish: (i: FaqItem) => void;
  onReorder: (newOrder: FaqItem[]) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  const endDrag = () => { dragFrom.current = null; setDragging(null); setOver(null); };

  return (
    <SectionCard flush icon="fa-layer-group" title={category}
                 actions={<StatusBadge size="sm" tone="primary">{items.length}</StatusBadge>}>
      <div className="sa-rows">
        {items.map((item, idx) => (
          <div key={item.id}
            className={`sa-row ${!item.isPublished ? 'is-dim' : ''} ${over === idx && dragging !== idx ? 'drag-over' : ''} ${dragging === idx ? 'dragging' : ''}`}
            draggable={canReorder}
            onDragStart={e => { dragFrom.current = idx; setDragging(idx); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={endDrag}
            onDragOver={e => { if (!canReorder) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(idx); }}
            onDrop={e => { e.preventDefault(); const from = dragFrom.current; endDrag(); if (from !== null) moveTo(from, idx); }}>
            {canReorder && <span className="sa-grip" aria-hidden="true"><i className="fa-solid fa-grip-vertical" /></span>}

            <button type="button" className="sa-row-main text-start border-0 bg-transparent p-0" style={{ color: 'inherit' }}
                    onClick={() => onEdit(item)}>
              <span className="sa-row-title">
                {item.question}
                {!item.isPublished && <StatusBadge size="sm" tone="neutral" icon="fa-eye-slash" className="ms-2">Oculta</StatusBadge>}
              </span>
              <span className="sa-row-text">{item.answer}</span>
            </button>

            <div className="sa-row-actions">
              <Switch checked={item.isPublished} onChange={() => onTogglePublish(item)}
                      ariaLabel={item.isPublished ? 'Ocultar de la web' : 'Publicar en la web'} />
              {canReorder && (
                <>
                  <IconButton icon="fa-arrow-up" label="Subir" size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveTo(idx, idx - 1)} />
                  <IconButton icon="fa-arrow-down" label="Bajar" size="sm" variant="ghost" disabled={idx === items.length - 1} onClick={() => moveTo(idx, idx + 1)} />
                </>
              )}
              <IconButton icon="fa-pen" label="Editar" size="sm" onClick={() => onEdit(item)} />
              <IconButton icon="fa-trash" label="Eliminar" size="sm" variant="danger" onClick={() => onDelete(item)} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Panel lateral de creación / edición
// ═════════════════════════════════════════════════════════════════════════
function FaqDrawer({ item, lang, categories, onClose, onSaved }: {
  item: FaqItem | 'new' | null;
  lang: 'es' | 'en';
  categories: string[];
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const confirm = useConfirm();
  const editingItem = item && item !== 'new' ? item : null;
  const blank = { category: '', question: '', answer: '', isPublished: true };
  const [form, setForm]       = useState(blank);
  const [initial, setInitial] = useState(blank);
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  // Al abrir, cargar los datos del elemento (o el formulario vacío).
  useEffect(() => {
    if (!item) return;
    const f = editingItem
      ? { category: editingItem.category, question: editingItem.question, answer: editingItem.answer, isPublished: editingItem.isPublished }
      : blank;
    setForm(f); setInitial(f); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const itemLang = editingItem?.lang ?? lang;

  async function close() {
    if (saving) return;
    if (dirty && !(await confirm({
      title: '¿Cerrar sin guardar?', message: 'Los cambios de esta pregunta se perderán.',
      confirmText: 'Cerrar sin guardar', cancelText: 'Seguir editando', tone: 'warning',
    }))) return;
    onClose();
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!form.category.trim()) { setError('La categoría es obligatoria.'); return; }
    if (!form.question.trim()) { setError('La pregunta es obligatoria.'); return; }
    if (!form.answer.trim())   { setError('La respuesta es obligatoria.'); return; }

    setSaving(true);
    try {
      const url    = editingItem ? `${API.landing}/landing/faq/${editingItem.id}` : `${API.landing}/landing/faq`;
      const method = editingItem ? 'PUT' : 'POST';
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          category:    form.category.trim(),
          question:    form.question.trim(),
          answer:      form.answer.trim(),
          lang:        itemLang,
          isPublished: form.isPublished,
        }),
      });
      onSaved(!editingItem);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally { setSaving(false); }
  }

  const suggestions = Array.from(new Set([...categories, ...SUGGESTED_CATEGORIES]));

  return (
    <Drawer
      open={!!item}
      onClose={close}
      size="md"
      title={editingItem ? 'Editar pregunta' : 'Nueva pregunta'}
      description={`Idioma: ${itemLang === 'es' ? 'Español' : 'Inglés'}`}
      footer={
        <>
          <button type="button" className="btn btn-bugie-outline" onClick={close} disabled={saving}>Cancelar</button>
          <button type="submit" form="faq-form" className="btn btn-bugie" disabled={saving || (!!editingItem && !dirty)}>
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Guardando…</>
              : <><i className="fa-solid fa-floppy-disk me-2" aria-hidden="true" />{editingItem ? 'Guardar cambios' : 'Crear pregunta'}</>}
          </button>
        </>
      }
    >
      <form id="faq-form" onSubmit={save} className="d-grid gap-3">
        <Field label="Categoría" required help="Elige una existente o escribe una nueva.">
          <input className="form-control" list="faq-categories" value={form.category}
                 onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Ej.: Pasajeros" />
        </Field>
        <datalist id="faq-categories">
          {suggestions.map(c => <option key={c} value={c} />)}
        </datalist>

        <Field label="Pregunta" required help={`${form.question.length}/300 caracteres`}>
          <input className="form-control" value={form.question} maxLength={300}
                 onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
                 placeholder="¿Cómo puedo cancelar un viaje?" />
        </Field>

        <Field label="Respuesta" required help="Escribe en frases cortas y claras.">
          <textarea className="form-control" rows={7} value={form.answer}
                    onChange={e => setForm(p => ({ ...p, answer: e.target.value }))}
                    placeholder="Explica la respuesta paso a paso…" />
        </Field>

        <Switch checked={form.isPublished} onChange={v => setForm(p => ({ ...p, isPublished: v }))}
                label="Publicar en la web" description="Si lo apagas, la pregunta queda guardada pero oculta." />

        {error && (
          <div className="sa-note bx-tone-bad" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{error}</span>
          </div>
        )}
      </form>
    </Drawer>
  );
}
