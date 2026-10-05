import { HOME_STATS } from '../../../content/landing/home';
import IconFeature from '../IconFeature';
import TitledCard from '../TitledCard';

interface Props {
  stats: typeof HOME_STATS;
  /** Idioma actual: va en las keys para que las métricas se vuelvan a
      montar al cambiar de idioma. */
  lang: string;
}

/** Beneficios de seguridad + tarjeta de métricas. */
export default function StatsSection({ stats, lang }: Props) {
  return (
    <section className="bugie-section bugie-section-alt">
      <div className="container bugie-container">
        <div className="row g-4 align-items-stretch">
          <div className="col-lg-7">
            <div className="bugie-card h-100">
              <div className="bugie-card-body p-4 p-lg-5">
                <div className="row g-3">
                  {(stats.features ?? []).map(f => (
                    <div className="col-md-6" key={f.title}>
                      <IconFeature className="bugie-tilt h-100" icon={f.icon} title={f.title} text={f.text} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-5">
            <TitledCard className="h-100" title={stats.metricsTitle ?? HOME_STATS.metricsTitle}>
              <div className="row g-3 bugie-stats-grid">
                {(stats.metrics ?? []).map(m => (
                  <div className="col-6" key={`${lang}-${m.label}`}>
                    <div className="bugie-kpi">
                      <div className="label">{m.label}</div>
                      <div className="value"><span>{m.value}</span>{m.suffix ?? ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TitledCard>
          </div>
        </div>
      </div>
    </section>
  );
}
