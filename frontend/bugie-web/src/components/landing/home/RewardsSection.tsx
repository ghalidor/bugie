import { HOME_REWARDS } from '../../../content/landing/home';

interface Props {
  rewards: typeof HOME_REWARDS;
  /** Idioma actual: va en las keys de las tarjetas. */
  lang: string;
}

/** Programa de puntos. Va después de las cifras (que dan confianza) y antes
    de las opiniones, para que quien entra se entere de que existe. */
export default function RewardsSection({ rewards, lang }: Props) {
  return (
    <section className="bugie-section-sm">
      <div className="container bugie-container">
        <div className="bugie-section-title" data-reveal>
          <span className="bugie-eyebrow">{rewards.eyebrow}</span>
          <h2>{rewards.title}</h2>
          <p>{rewards.text}</p>
        </div>

        <div className="row g-3 g-lg-4">
          {(rewards.items ?? []).map((item, i) => (
            <div className="col-sm-6 col-lg-3" key={`${lang}-rw-${i}`}>
              <div className="bugie-card h-100" data-reveal>
                <div className="bugie-card-body">
                  <div className="bugie-reward-icon d-flex align-items-center justify-content-center mb-3" aria-hidden="true">
                    <i className={`fa-solid ${item.icon}`} />
                  </div>
                  <div className="fw-bold mb-1">{item.title}</div>
                  <p className="bugie-muted small mb-0">{item.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {rewards.ctaLabel ? (
          <div className="text-center mt-4" data-reveal>
            <a href={rewards.ctaHref ?? HOME_REWARDS.ctaHref}
               className="btn btn-bugie rounded-pill px-4 py-2">
              {rewards.ctaLabel}
            </a>
            {rewards.note ? (
              <div className="bugie-muted small mt-2">{rewards.note}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
