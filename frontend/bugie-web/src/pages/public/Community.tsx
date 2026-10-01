import { useEffect, useState } from 'react';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

interface Article {
  id: string; slug: string; tag: string;
  title: string; summary: string;
  lang: string; publishedAt: string;
}

const TAG_COLOR: Record<string, string> = {
  Producto: 'primary',   Seguridad: 'danger',
  Tecnología: 'info',    Tecnologia: 'info',
  Empresa: 'secondary',  Product: 'primary',
  Safety: 'danger',      Technology: 'info',
};

export default function Community() {
  const [lang,     setLang]     = useState('es');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Carga publicaciones desde la API (endpoint sigue siendo /landing/news en el backend)
  useEffect(() => {
    setLoading(true);
    fetch(`${LANDING_API}/news?lang=${lang}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setArticles(Array.isArray(data) ? data : []);
      })
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [lang]);

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">
        <div className="row g-4 align-items-start">

          {/* Panel izquierdo fijo */}
          <div className="col-lg-4" data-reveal>
            <div className="bugie-shell-card">
              <div className="text-uppercase small fw-bold text-bugie-accent mb-2">Comunidad</div>
              <h1 className="bugie-h2 mb-3">Comunidad Bugie en Trujillo.</h1>
              <p className="bugie-muted mb-4">
                Historias, avances del producto y novedades de la comunidad de pasajeros y conductores.
              </p>
              <div className="d-flex gap-2">
                {[['es','Español'],['en','English']].map(([l, label]) => (
                  <button key={l}
                    className={`btn btn-sm ${lang === l ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
                    onClick={() => setLang(l)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lista de publicaciones */}
          <div className="col-lg-8">
            {loading ? (
              <div className="d-flex justify-content-center py-5">
                <span className="spinner-border" />
              </div>
            ) : articles.length === 0 ? (
              <div className="bugie-card p-4 text-center bugie-muted">
                <i className="fa-solid fa-users fa-2x mb-3 d-block" />
                No hay publicaciones disponibles en este idioma.
              </div>
            ) : (
              <div className="d-grid gap-3">
                {articles.map(a => (
                  <div className="bugie-card" key={a.id} data-reveal>
                    <div className="bugie-card-body">
                      <div className="d-flex justify-content-between align-items-start gap-3">
                        <div className="flex-grow-1">
                          <span className={`badge text-bg-${TAG_COLOR[a.tag] ?? 'secondary'} mb-2`}>
                            {a.tag}
                          </span>
                          <div className="fw-bold fs-5 mb-2">{a.title}</div>
                          <div className="small bugie-muted">{a.summary}</div>
                        </div>
                        <div className="small bugie-muted text-nowrap">
                          {new Date(a.publishedAt).toLocaleDateString(
                            lang === 'es' ? 'es-PE' : 'en-US',
                            { year: 'numeric', month: 'long', day: 'numeric' }
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}