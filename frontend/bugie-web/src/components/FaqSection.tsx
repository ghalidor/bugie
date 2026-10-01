import { useEffect, useState } from 'react';

/// Pregunta frecuente como la devuelve /api/landing/faq.
/// El backend solo devuelve las publicadas (IsPublished=1), ya ordenadas.
interface FaqItem {
  id:        string;
  lang:      string;
  category:  string;
  question:  string;
  answer:    string;
}

/// Sección "Preguntas frecuentes" para la landing pública.
/// - Agrupa por categoría (las que devuelva el backend).
/// - Acordeón: solo una pregunta abierta a la vez.
/// - Si no hay preguntas publicadas, no renderiza nada (no muestra "no hay").
interface FaqSectionProps {
  lang?: string;  // default 'es'
  /// Pequeño "eyebrow" arriba del título (estilo del resto de la landing).
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export default function FaqSection({
  lang = 'es',
  eyebrow = 'Resolvemos tus dudas',
  title = 'Preguntas frecuentes',
  subtitle = 'Las dudas más comunes de nuestros pasajeros y conductores.',
}: FaqSectionProps) {
  const [items, setItems]     = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Pregunta abierta (id) — null si todas están cerradas.
  const [openId, setOpenId]   = useState<string | null>(null);
  // Categoría seleccionada para filtrar (null = todas).
  const [activeCat, setActiveCat] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_LANDING}/landing/faq?lang=${lang}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: FaqItem[]) => setItems(data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [lang]);

  // Si no hay preguntas (público), no rendereamos nada para no dejar sección vacía.
  if (!loading && items.length === 0) return null;

  // Categorías únicas en el orden en que vienen (el backend las ordena por Category, SortOrder).
  const categories: string[] = [];
  for (const it of items) {
    if (!categories.includes(it.category)) categories.push(it.category);
  }

  // Lista visible según filtro
  const visibleItems = activeCat
    ? items.filter(i => i.category === activeCat)
    : items;

  return (
    <section className="bugie-section">
      <div className="container bugie-container">
        {/* Header */}
        <div className="bugie-section-title text-center">
          <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{eyebrow}</div>
          <h2 className="bugie-h2 mb-3">{title}</h2>
          {subtitle && <p className="bugie-lead mx-auto" style={{ maxWidth: 640 }}>{subtitle}</p>}
        </div>

        {/* Filtro por categoría (chips). Solo aparece si hay 2+ categorías. */}
        {categories.length > 1 && (
          <div className="d-flex flex-wrap justify-content-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setActiveCat(null)}
              className={`btn btn-sm rounded-pill ${activeCat === null ? 'btn-bugie text-white' : 'btn-outline-secondary'}`}>
              Todas
            </button>
            {categories.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(c)}
                className={`btn btn-sm rounded-pill ${activeCat === c ? 'btn-bugie text-white' : 'btn-outline-secondary'}`}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Lista de preguntas (acordeón) */}
        <div className="mx-auto" style={{ maxWidth: 820 }}>
          {loading ? (
            <div className="d-flex justify-content-center py-4">
              <span className="spinner-border" />
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {visibleItems.map(item => {
                const isOpen = openId === item.id;
                return (
                  <div key={item.id} className="bugie-card" style={{
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s',
                    boxShadow: isOpen ? '0 8px 25px rgba(0,0,0,0.08)' : undefined,
                  }}>
                    {/* Pregunta (clickeable) */}
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      className="d-flex align-items-center justify-content-between w-100 p-3 text-start"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      aria-expanded={isOpen}>
                      <div className="d-flex align-items-center gap-3 flex-grow-1">
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'var(--bugie-primary-soft, rgba(129,140,248,0.15))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'transform 0.2s',
                          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                        }}>
                          <i className="fa-solid fa-plus" style={{
                            color: 'var(--bugie-primary, #818cf8)', fontSize: '0.85rem',
                          }} />
                        </div>
                        <span className="fw-semibold">{item.question}</span>
                      </div>
                      {/* Badge de categoría (solo si no estás filtrando ya por ella) */}
                      {!activeCat && (
                        <span className="badge rounded-pill ms-2 d-none d-md-inline-block" style={{
                          background: 'rgba(148,163,184,0.15)',
                          color: 'var(--bugie-muted)',
                          fontSize: '0.7rem',
                        }}>
                          {item.category}
                        </span>
                      )}
                    </button>

                    {/* Respuesta (collapse simple por height max) */}
                    <div style={{
                      maxHeight: isOpen ? 600 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 0.25s ease-out',
                    }}>
                      <div className="px-3 pb-3" style={{ paddingLeft: 60 }}>
                        <p className="mb-0 bugie-muted" style={{ whiteSpace: 'pre-wrap' }}>
                          {item.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
