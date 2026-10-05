import type { HOME_FEATURES } from '../../../content/landing/home';
import Eyebrow from '../Eyebrow';
import IconFeature from '../IconFeature';

/** Tarjetas de valor debajo de la portada. */
export default function FeaturesSection({ features }: { features: typeof HOME_FEATURES }) {
  return (
    <section className="bugie-section-tight">
      <div className="container bugie-container">
        <div className="bugie-section-title">
          <Eyebrow>{features.eyebrow}</Eyebrow>
          <h2 className="bugie-h2 mb-3">{features.title}</h2>
          <p className="bugie-lead mb-0">{features.text}</p>
        </div>
        <div className="row g-4 bugie-feature-grid">
          {(features.items ?? []).map(f => (
            <div className="col-md-6 col-xl-3" key={f.title}>
              <IconFeature className="bugie-tilt" heading icon={f.icon} title={f.title} text={f.text} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
