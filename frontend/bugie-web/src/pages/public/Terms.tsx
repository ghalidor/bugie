import { useOutletContext } from 'react-router-dom';
import { useLanding, parse } from '../../hooks/useLanding';

const FALLBACK = {
  title: 'Términos y Condiciones',
  updatedLabel: 'Última actualización',
  updatedAt: '',
  html: '<p>Cargando contenido...</p>',
};

export default function Terms() {
  const ctx  = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data, loading } = useLanding(lang);
  const d = parse(data?.sections ?? [], 'terms', FALLBACK);

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">
        <div className="bugie-card p-4 p-md-5">
          <h1 className="bugie-h2 mb-2">{d.title}</h1>
          {d.updatedAt && (
            <p className="small bugie-muted mb-4">
              {d.updatedLabel}: {d.updatedAt}
            </p>
          )}

          {loading ? (
            <p className="bugie-muted">Cargando...</p>
          ) : (
            <div
              className="bugie-legal-content"
              dangerouslySetInnerHTML={{ __html: d.html ?? '' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}