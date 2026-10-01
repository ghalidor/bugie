import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';

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

/// Categorías sugeridas. El admin puede crear cualquier otra escribiéndola
/// libremente — esto es solo para el autocomplete inicial.
const SUGGESTED_CATEGORIES = ['Pasajeros', 'Conductores', 'Pagos', 'Seguridad', 'Cuenta'];

/// Color de la categoría (estable: hash simple del nombre).
function categoryColor(category: string): string {
  const palette = ['#818cf8', '#34d399', '#f59e0b', '#38bdf8', '#ef4444', '#c084fc', '#10b981'];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash + category.charCodeAt(i)) % palette.length;
  return palette[hash];
}

export default function Faq() {
  const [items,    setItems]    = useState<FaqItem[]>([]);
  const [lang,     setLang]     = useState<'es' | 'en'>('es');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editing,  setEditing]  = useState<FaqItem | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lang]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch<FaqItem[]>(
        `${API.landing}/landing/faq/admin?lang=${lang}`);
      setItems(data ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar las preguntas.');
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
      // Actualización optimista
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isPublished: !i.isPublished } : i));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cambiar publicación.');
    }
  }

  async function deleteItem(item: FaqItem) {
    if (!confirm(`¿Borrar la pregunta "${item.question}"?`)) return;
    try {
      await apiFetch(`${API.landing}/landing/faq/${item.id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al borrar.');
    }
  }

  /// Reordena una categoría completa después de un drag & drop.
  /// El frontend manda al backend la nueva lista de IDs de esa categoría.
  async function saveReorder(category: string, newOrder: FaqItem[]) {
    // Optimista: actualizamos local primero para no esperar el servidor.
    const otherItems = items.filter(i => i.category !== category);
    setItems([...otherItems, ...newOrder]);

    try {
      await apiFetch(`${API.landing}/landing/faq/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ ids: newOrder.map(i => i.id) }),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar el nuevo orden.');
      load(); // Si falla, recargamos para volver al estado real del backend.
    }
  }

  // Agrupar por categoría (sin perder orden de SortOrder dentro de cada una).
  // El backend ya las trae ordenadas por (Category, SortOrder).
  const grouped: Record<string, FaqItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  const categories = Object.keys(grouped);

  return (
    <>
      <PageHeader
        title="Preguntas frecuentes"
        subtitle="Gestiona las preguntas que aparecen en la sección FAQ de la landing."
        icon="fa-solid fa-circle-question"
        actions={
          <button className="btn btn-bugie text-white" onClick={() => setCreating(true)}>
            <i className="fa-solid fa-plus me-2" />Nueva pregunta
          </button>
        }
      />

      {/* KPIs simples */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Total',       value: items.length,                                   color: '#818cf8', icon: 'fa-circle-question' },
          { label: 'Publicadas',  value: items.filter(i => i.isPublished).length,        color: '#34d399', icon: 'fa-eye'             },
          { label: 'Ocultas',     value: items.filter(i => !i.isPublished).length,       color: '#94a3b8', icon: 'fa-eye-slash'       },
          { label: 'Categorías',  value: categories.length,                              color: '#f59e0b', icon: 'fa-layer-group'     },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading ? '…' : k.value}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selector de idioma */}
      <div className="d-flex gap-2 mb-3 align-items-center">
        {(['es', 'en'] as const).map(l => (
          <button key={l} type="button" onClick={() => setLang(l)}
            className={`btn btn-sm ${lang === l ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}>
            {l === 'es' ? '🇵🇪 Español' : '🇺🇸 English'}
          </button>
        ))}
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto" onClick={load}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {/* Aviso de drag & drop */}
      <div className="alert small mb-3" style={{
        background: 'rgba(129,140,248,0.08)',
        border: '1px solid rgba(129,140,248,0.2)',
        color: 'inherit',
      }}>
        <i className="fa-solid fa-hand-pointer me-2" style={{ color: '#818cf8' }} />
        Arrastra las preguntas para reordenarlas dentro de cada categoría. El orden se guarda automáticamente.
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : items.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <i className="fa-solid fa-circle-question fa-2x mb-3 d-block bugie-muted" />
          <div className="fw-semibold mb-1">Sin preguntas</div>
          <div className="small bugie-muted">Empieza creando la primera pregunta.</div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {categories.map(cat => (
            <CategoryBlock
              key={cat}
              category={cat}
              items={grouped[cat]}
              onEdit={setEditing}
              onDelete={deleteItem}
              onTogglePublish={togglePublish}
              onReorder={(newOrder) => saveReorder(cat, newOrder)}
            />
          ))}
        </div>
      )}

      {creating && (
        <FaqModal
          item={null}
          lang={lang}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {editing && (
        <FaqModal
          item={editing}
          lang={lang}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Bloque de una categoría con drag & drop nativo HTML5.
// El admin puede arrastrar cada pregunta para reordenarla. Al soltar,
// llamamos a onReorder con el nuevo orden y el padre guarda en backend.
// ═════════════════════════════════════════════════════════════════════════
function CategoryBlock({ category, items, onEdit, onDelete, onTogglePublish, onReorder }: {
  category: string;
  items: FaqItem[];
  onEdit: (i: FaqItem) => void;
  onDelete: (i: FaqItem) => void;
  onTogglePublish: (i: FaqItem) => void;
  onReorder: (newOrder: FaqItem[]) => void;
}) {
  const color = categoryColor(category);
  // Estado local mientras el usuario arrastra. Lo usamos para mostrar
  // el "preview" del nuevo orden antes de confirmar al backend.
  const [localItems, setLocalItems] = useState(items);
  // Si el padre re-renderiza con nuevas items (recarga, edición, etc),
  // sincronizamos el estado local.
  useEffect(() => { setLocalItems(items); }, [items]);

  // Refs para tracking del drag
  const draggedIndex = useRef<number | null>(null);
  const [draggingOver, setDraggingOver] = useState<number | null>(null);

  function onDragStart(e: React.DragEvent, idx: number) {
    draggedIndex.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // Hack visual: hace transparente el elemento mientras se arrastra.
    if (e.currentTarget instanceof HTMLElement) {
      setTimeout(() => {
        (e.currentTarget as HTMLElement).style.opacity = '0.4';
      }, 0);
    }
  }

  function onDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    draggedIndex.current = null;
    setDraggingOver(null);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggingOver(idx);
  }

  function onDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    const fromIdx = draggedIndex.current;
    if (fromIdx === null || fromIdx === dropIdx) {
      setDraggingOver(null);
      return;
    }

    // Reorganizamos el array localmente
    const reordered = [...localItems];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setLocalItems(reordered);
    setDraggingOver(null);

    // Avisamos al padre, que guardará en backend
    onReorder(reordered);
  }

  return (
    <div className="bugie-card" style={{ overflow: 'hidden' }}>
      {/* Header de categoría */}
      <div className="px-3 py-2 d-flex align-items-center gap-2"
           style={{ background: color + '15', borderBottom: '1px solid var(--bugie-border)' }}>
        <i className="fa-solid fa-layer-group" style={{ color, fontSize: '0.85rem' }} />
        <span className="fw-bold">{category}</span>
        <span className="badge rounded-pill" style={{
          background: color + '22', color, fontSize: '0.7rem',
        }}>
          {localItems.length}
        </span>
      </div>

      {/* Preguntas (draggables) */}
      <div className="d-flex flex-column">
        {localItems.map((item, idx) => (
          <div key={item.id}
            draggable
            onDragStart={(e) => onDragStart(e, idx)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, idx)}
            onDrop={(e) => onDrop(e, idx)}
            style={{
              padding: '12px 16px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--bugie-border)',
              cursor: 'grab',
              background: draggingOver === idx ? color + '10' : 'transparent',
              transition: 'background 0.15s',
              opacity: item.isPublished ? 1 : 0.55,
            }}>
            <div className="d-flex align-items-start gap-3">
              {/* Handle */}
              <div style={{
                paddingTop: 4, color: '#94a3b8', cursor: 'grab', flexShrink: 0,
              }}>
                <i className="fa-solid fa-grip-vertical" />
              </div>

              {/* Contenido */}
              <div className="flex-grow-1 min-w-0">
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <span className="fw-semibold">{item.question}</span>
                  {!item.isPublished && (
                    <span className="badge rounded-pill" style={{
                      background: 'rgba(148,163,184,0.2)', color: '#94a3b8',
                      fontSize: '0.7rem',
                    }}>
                      <i className="fa-solid fa-eye-slash me-1" style={{ fontSize: '0.6rem' }} />
                      Oculta
                    </span>
                  )}
                </div>
                <div className="small bugie-muted" style={{
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {item.answer}
                </div>
              </div>

              {/* Acciones */}
              <div className="d-flex gap-1 flex-shrink-0">
                <button className="btn btn-sm btn-bugie-outline"
                        onClick={() => onTogglePublish(item)}
                        title={item.isPublished ? 'Ocultar' : 'Publicar'}>
                  <i className={`fa-solid ${item.isPublished ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
                <button className="btn btn-sm btn-bugie-outline"
                        onClick={() => onEdit(item)} title="Editar">
                  <i className="fa-solid fa-pen" />
                </button>
                <button className="btn btn-sm btn-outline-danger"
                        onClick={() => onDelete(item)} title="Borrar">
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Modal de creación / edición
// ═════════════════════════════════════════════════════════════════════════
function FaqModal({ item, lang, onClose, onSaved }: {
  item: FaqItem | null;   // null = crear, no-null = editar
  lang: 'es' | 'en';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    category:    item?.category ?? '',
    question:    item?.question ?? '',
    answer:      item?.answer   ?? '',
    isPublished: item?.isPublished ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.category.trim()) { setError('La categoría es obligatoria.'); return; }
    if (!form.question.trim()) { setError('La pregunta es obligatoria.'); return; }
    if (!form.answer.trim())   { setError('La respuesta es obligatoria.'); return; }

    setSaving(true);
    try {
      const url    = item
        ? `${API.landing}/landing/faq/${item.id}`
        : `${API.landing}/landing/faq`;
      const method = item ? 'PUT' : 'POST';
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          category:    form.category.trim(),
          question:    form.question.trim(),
          answer:      form.answer.trim(),
          lang:        item?.lang ?? lang,
          isPublished: form.isPublished,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally { setSaving(false); }
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(640px, 100%)', maxHeight: '92vh',
        background: 'var(--bugie-surface)', borderRadius: 18,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 70px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)', flexShrink: 0 }}>
          <div className="d-flex align-items-center gap-3">
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(129,140,248,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={`fa-solid ${item ? 'fa-pen' : 'fa-plus'}`}
                 style={{ color: '#818cf8' }} />
            </div>
            <div>
              <div className="fw-bold">{item ? 'Editar pregunta' : 'Nueva pregunta'}</div>
              <div className="small bugie-muted">
                {lang === 'es' ? '🇵🇪 Español' : '🇺🇸 English'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={save} style={{ overflowY: 'auto', padding: '1.25rem', flexGrow: 1 }}>
          <div className="mb-3">
            <label className="form-label small bugie-muted text-uppercase">
              Categoría <span className="text-danger">*</span>
            </label>
            <input
              className="form-control"
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              list="faq-categories"
              placeholder="ej. Pasajeros"
            />
            <datalist id="faq-categories">
              {SUGGESTED_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
            <div className="form-text small">
              Puedes elegir una sugerida o escribir una nueva.
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small bugie-muted text-uppercase">
              Pregunta <span className="text-danger">*</span>
            </label>
            <input
              className="form-control"
              value={form.question}
              onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
              maxLength={300}
              placeholder="¿Cómo puedo cancelar un viaje?"
              autoFocus
            />
          </div>

          <div className="mb-3">
            <label className="form-label small bugie-muted text-uppercase">
              Respuesta <span className="text-danger">*</span>
            </label>
            <textarea
              className="form-control"
              rows={6}
              value={form.answer}
              onChange={e => setForm(p => ({ ...p, answer: e.target.value }))}
              placeholder="Explica claramente la respuesta..."
            />
          </div>

          <div className="form-check">
            <input className="form-check-input"
                   type="checkbox"
                   id="faq-published"
                   checked={form.isPublished}
                   onChange={e => setForm(p => ({ ...p, isPublished: e.target.checked }))} />
            <label className="form-check-label small" htmlFor="faq-published">
              Publicar en la landing inmediatamente
            </label>
          </div>

          {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}
        </form>

        {/* Footer sticky */}
        <div className="p-3 border-top"
             style={{ borderColor: 'var(--bugie-border)', flexShrink: 0,
                      background: 'var(--bugie-surface)' }}>
          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-bugie-outline"
                    onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-bugie text-white"
                    onClick={save} disabled={saving}>
              {saving
                ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                : <><i className="fa-solid fa-floppy-disk me-2" />{item ? 'Guardar cambios' : 'Crear pregunta'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
