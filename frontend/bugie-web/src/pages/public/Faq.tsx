import { useEffect, useState } from 'react';

/// Pregunta frecuente como la devuelve el backend (GET /api/landing/faq).
interface FaqItem {
  id:       string;
  lang:     string;
  category: string;
  question: string;
  answer:   string;
}

/// Página pública /faq.
/// Mismo estilo "interno" que /empresa o /seguridad: hero pequeño + contenido.
/// Las preguntas vienen del backend agrupadas por categoría.
export default function Faq() {
  const [items, setItems]     = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Pregunta abierta en el acordeón. Null = todas cerradas. Solo una a la vez.
  const [openId, setOpenId]   = useState<string | null>(null);
  // Categoría seleccionada para filtrar (null = todas).
  const [activeCat, setActiveCat] = useState<string | null>(null);

  useEffect(() => {
    const url = `${import.meta.env.VITE_API_LANDING}/landing/faq?lang=es`;
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data: FaqItem[]) => setItems(data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Categorías únicas en el orden en que las trae el backend
  // (ya viene ordenado por Category, SortOrder).
  const categories: string[] = [];
  for (const it of items) {
    if (!categories.includes(it.category)) categories.push(it.category);
  }

  // Lista visible según filtro de categoría
  const visibleItems = activeCat
    ? items.filter(i => i.category === activeCat)
    : items;

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">

        {/* Hero / introducción de la página */}
        <div className="row g-4 align-items-start mb-4">
          <div className="col-lg-7" data-reveal>
            <div className="bugie-shell-hero">
              <div className="text-uppercase small fw-bold text-bugie-accent">
                Resolvemos tus dudas
              </div>
              <h1 className="bugie-h2 mb-3">Preguntas frecuentes</h1>
              <p className="bugie-lead mb-0">
                Las dudas más comunes de nuestros pasajeros y conductores.
                Si no encontrás lo que buscás, escribinos.
              </p>
            </div>
          </div>
          <div className="col-lg-5 d-none d-lg-block" data-reveal>
            <div className="bugie-card p-4 text-center">
              <i className="fa-solid fa-circle-question fa-3x mb-2"
                 style={{ color: 'var(--bugie-primary, #818cf8)' }} />
              <div className="fw-bold">¿No encontrás respuesta?</div>
              <div className="small bugie-muted mb-3">
                Nuestro equipo te ayuda.
              </div>
              <a href="/contacto" className="btn btn-bugie text-white btn-sm">
                <i className="fa-solid fa-envelope me-2" />Escribinos
              </a>
            </div>
          </div>
        </div>

        {/* Cuerpo: filtro + acordeón */}
        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <span className="spinner-border" />
          </div>
        ) : items.length === 0 ? (
          // Estado vacío — la tabla no tiene preguntas publicadas todavía.
          <div className="bugie-card p-5 text-center">
            <i className="fa-solid fa-circle-question fa-2x mb-3 d-block bugie-muted" />
            <div className="fw-semibold mb-1">Sin preguntas todavía</div>
            <div className="small bugie-muted">
              Estamos preparando las respuestas. Vuelve pronto.
            </div>
          </div>
        ) : (
          <>
            {/* Filtro por categoría (chips). Solo aparece si hay 2+ categorías. */}
            {categories.length > 1 && (
              <div className="d-flex flex-wrap justify-content-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setActiveCat(null)}
                  className={`btn btn-sm rounded-pill ${
                    activeCat === null ? 'btn-bugie text-white' : 'btn-outline-secondary'
                  }`}>
                  Todas
                </button>
                {categories.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setActiveCat(c)}
                    className={`btn btn-sm rounded-pill ${
                      activeCat === c ? 'btn-bugie text-white' : 'btn-outline-secondary'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Acordeón de preguntas */}
            <div className="mx-auto" style={{ maxWidth: 820 }}>
              <div className="d-flex flex-column gap-2">
                {visibleItems.map(item => {
                  const isOpen = openId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="bugie-card"
                      style={{
                        overflow: 'hidden',
                        transition: 'box-shadow 0.2s',
                        boxShadow: isOpen ? '0 8px 25px rgba(0,0,0,0.08)' : undefined,
                      }}>
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : item.id)}
                        className="d-flex align-items-center justify-content-between w-100 p-3 text-start"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        aria-expanded={isOpen}>
                        <div className="d-flex align-items-center gap-3 flex-grow-1">
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'var(--bugie-primary-soft, rgba(129,140,248,0.15))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'transform 0.2s',
                            transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                          }}>
                            <i className="fa-solid fa-plus"
                               style={{ color: 'var(--bugie-primary, #818cf8)', fontSize: '0.85rem' }} />
                          </div>
                          <span className="fw-semibold">{item.question}</span>
                        </div>
                        {/* Badge de categoría — solo visible en desktop y si no filtra ya por ella */}
                        {!activeCat && (
                          <span
                            className="badge rounded-pill ms-2 d-none d-md-inline-block"
                            style={{
                              background: 'rgba(148,163,184,0.15)',
                              color: 'var(--bugie-muted)',
                              fontSize: '0.7rem',
                            }}>
                            {item.category}
                          </span>
                        )}
                      </button>

                      {/* Cuerpo de la respuesta (collapse manual con max-height) */}
                      <div style={{
                        maxHeight: isOpen ? 800 : 0,
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
            </div>
          </>
        )}

      </div>
    </div>
  );
}
