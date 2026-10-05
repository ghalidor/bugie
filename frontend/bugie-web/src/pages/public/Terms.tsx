import LegalDocument from '../../components/landing/LegalDocument';
import { TERMS } from '../../content/landing/legal';

/** /terminos. El texto se edita desde el gestor (sección 'terms'). */
export default function Terms() {
  return <LegalDocument sectionKey="terms" fallback={TERMS} />;
}
