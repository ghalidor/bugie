import { useEffect, useState } from 'react';
import { LANDING_API } from '../../content/landing/api';
import { COMMUNITY, COMMUNITY_LANGS, TAG_COLOR } from '../../content/landing/community';
import LandingPage from '../../components/landing/LandingPage';
import Eyebrow from '../../components/landing/Eyebrow';
import { fillCity, useCity } from '../../hooks/useCity';

interface Article {
  id: string; slug: string; tag: string;
  title: string; summary: string;
  lang: string; publishedAt: string;
}

/** /comunidad. Lista de publicaciones que vienen de la API, con su propio
    selector de idioma. */
export default function Community() {
  const [lang,     setLang]     = useState('es');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);
  const city = useCity();

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
    <LandingPage>
      <div className="row g-4 align-items-start">

        {/* Panel izquierdo fijo */}
        <div className="col-lg-4" data-reveal>
          <div className="bugie-shell-card">
            <Eyebrow>{COMMUNITY.eyebrow}</Eyebrow>
            <h1 className="bugie-h2 mb-3">{fillCity(COMMUNITY.title, city)}</h1>
            <p className="bugie-muted mb-4">{COMMUNITY.text}</p>
            <div className="d-flex gap-2">
              {COMMUNITY_LANGS.map(l => (
                <button key={l.code}
                  className={`btn btn-sm ${lang === l.code ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
                  onClick={() => setLang(l.code)}>
                  {l.label}
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
              {COMMUNITY.empty}
            </div>
          ) : (
            <div className="d-grid gap-3">
              {articles.map(a => (
                <ArticleCard key={a.id} article={a} lang={lang} />
              ))}
            </div>
          )}
        </div>
      </div>
    </LandingPage>
  );
}

function ArticleCard({ article: a, lang }: { article: Article; lang: string }) {
  return (
    <div className="bugie-card" data-reveal>
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
  );
}
