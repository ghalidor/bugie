import { useLandingContent } from '../../hooks/useLandingContent';
import { LEGAL_LOADING, type LegalContent } from '../../content/landing/legal';
import LandingPage from './LandingPage';

interface Props {
  /** Clave de la sección en el gestor ('terms' o 'privacy'). */
  sectionKey: string;
  fallback: LegalContent;
}

/** Página legal (términos, privacidad): título, fecha y HTML del gestor. */
export default function LegalDocument({ sectionKey, fallback }: Props) {
  const { section, loading } = useLandingContent();
  const d = section(sectionKey, fallback);

  return (
    <LandingPage>
      <div className="bugie-card p-4 p-md-5">
        <h1 className="bugie-h2 mb-2">{d.title}</h1>
        {d.updatedAt && (
          <p className="small bugie-muted mb-4">
            {d.updatedLabel}: {d.updatedAt}
          </p>
        )}

        {loading ? (
          <p className="bugie-muted">{LEGAL_LOADING}</p>
        ) : (
          <div
            className="bugie-legal-content"
            dangerouslySetInnerHTML={{ __html: d.html ?? '' }}
          />
        )}
      </div>
    </LandingPage>
  );
}
