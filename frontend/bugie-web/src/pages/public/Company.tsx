import { useLandingContent } from '../../hooks/useLandingContent';
import { COMPANY } from '../../content/landing/company';
import LandingPage from '../../components/landing/LandingPage';
import Eyebrow from '../../components/landing/Eyebrow';
import TitledCard from '../../components/landing/TitledCard';
import IconListItem from '../../components/landing/IconListItem';

/** /empresa. Textos en src/content/landing/company.ts (sección 'company'). */
export default function Company() {
  const { section } = useLandingContent();
  const d = section('company', COMPANY);

  return (
    <LandingPage>
      <div className="row g-4 align-items-start">
        <div className="col-lg-5" data-reveal>
          <div className="bugie-shell-hero">
            <Eyebrow className="">{d.eyebrow}</Eyebrow>
            <h1 className="bugie-h2 mb-0">{d.title}</h1>
            <p className="description mb-0">{d.description}</p>
          </div>
        </div>
        <div className="col-lg-7">
          <div className="row g-4">
            <div className="col-md-6" data-reveal>
              <TitledCard className="h-100" title={d.missionTitle}>{d.mission}</TitledCard>
            </div>
            <div className="col-md-6" data-reveal>
              <TitledCard className="h-100" title={d.visionTitle}>{d.vision}</TitledCard>
            </div>
            <div className="col-12" data-reveal>
              <TitledCard title={d.problemsTitle}>
                <div className="row g-3">
                  {(d.problems ?? []).map(p => (
                    <div className="col-md-6" key={p.title}>
                      <div className="bugie-feature h-100">
                        <i className={`fa-solid ${p.iconClass} mb-2 d-block bugie-problem-icon`} />
                        <div className="fw-bold mb-1">{p.title}</div>
                        <div className="small bugie-muted">{p.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </TitledCard>
            </div>
            <div className="col-12" data-reveal>
              <TitledCard title={d.teamTitle}>
                <div className="row g-3">
                  {(d.team ?? []).map(m => (
                    <div className="col-md-4" key={m.name}>
                      <IconListItem small icon={m.icon} title={m.name} text={m.role} />
                    </div>
                  ))}
                </div>
              </TitledCard>
            </div>
          </div>
        </div>
      </div>
    </LandingPage>
  );
}
