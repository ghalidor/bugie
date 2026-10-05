import LegalDocument from '../../components/landing/LegalDocument';
import { PRIVACY } from '../../content/landing/legal';

/** /privacidad. El texto se edita desde el gestor (sección 'privacy'). */
export default function Privacy() {
  return <LegalDocument sectionKey="privacy" fallback={PRIVACY} />;
}
