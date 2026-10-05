import BugieMap from '../../components/BugieMap';
import { useLandingContent } from '../../hooks/useLandingContent';
import { SAFETY } from '../../content/landing/safety';
import LandingPage from '../../components/landing/LandingPage';
import Eyebrow from '../../components/landing/Eyebrow';
import IconFeature from '../../components/landing/IconFeature';

/** /seguridad. Textos en src/content/landing/safety.ts (sección 'safety'). */
export default function Safety() {
  const { section } = useLandingContent();
  const d = section('safety', SAFETY);

  return (
    <LandingPage>
      <div className="row g-4 align-items-center mb-5">
        <div className="col-lg-6" data-reveal>
          <Eyebrow>{d.eyebrow}</Eyebrow>
          <h1 className="bugie-h2 mb-3">{d.title}</h1>
          <p className="bugie-lead mb-0">{d.subtitle}</p>
        </div>
        <div className="col-lg-6" data-reveal>
          {/* Centrado en la ubicación configurada en el admin (sin puntos fijos de una ciudad) */}
          <BugieMap height={300} />
          <div className="small bugie-muted text-center mt-2">{d.mapLabel}</div>
        </div>
      </div>

      <div className="row g-4">
        {(d.features ?? []).map(f => (
          <div className="col-md-6 col-xl-4" key={f.title} data-reveal>
            <IconFeature className="h-100" icon={f.icon} title={f.title} text={f.text} />
          </div>
        ))}
      </div>

      <div className="row g-3 mt-2">
        {(d.stats ?? []).map(s => (
          <div className="col-6 col-md-3" key={s.label}>
            <div className="bugie-kpi text-center">
              <div className="value">{s.value}</div>
              <div className="label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </LandingPage>
  );
}
