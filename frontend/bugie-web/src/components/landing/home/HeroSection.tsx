import { Link } from 'react-router-dom';
import { HOME_HERO, HOME_LINKS } from '../../../content/landing/home';
import PhoneMockup from './PhoneMockup';

/** Portada del inicio: textos, botones, cifras, teléfono y banda animada. */
export default function HeroSection({ hero }: { hero: typeof HOME_HERO }) {
  // La banda se duplica para que la animación dé la vuelta sin saltos.
  const marqueeItems = [...(hero.marquee ?? []), ...(hero.marquee ?? [])];
  const phone = hero.phone ?? HOME_HERO.phone;

  return (
    <section className="bugie-hero bugie-grid-lines">
      <div className="container bugie-container">
        <div className="bugie-hero-wrap">
          <div className="bugie-hero-media" aria-hidden="true" />
          <div className="bugie-orb orb-a" aria-hidden="true" />
          <div className="bugie-orb orb-b" aria-hidden="true" />
          <div className="bugie-orb orb-c" aria-hidden="true" />
          <div className="bugie-hero-content row g-4 align-items-center">
            <div className="col-lg-7">
              <div className="bugie-hero-copy" data-reveal>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {(hero.pills ?? []).map(pill => (
                    <span key={pill} className="bugie-pill">
                      <i className="fa-solid fa-shield-halved text-bugie-accent" /> {pill}
                    </span>
                  ))}
                </div>
                <h1 className="bugie-h1 mb-3">
                  <span className="bugie-gradient-text">{hero.title}</span>
                </h1>
                <p className="bugie-lead mb-4">{hero.subtitle}</p>
                <div className="d-flex flex-wrap gap-2 mb-4">
                  <Link className="btn btn-bugie text-white" to={HOME_LINKS.heroPrimary}>{hero.ctaPrimary}</Link>
                  <Link className="btn btn-bugie-outline" to={HOME_LINKS.heroSecondary}>{hero.ctaSecondary}</Link>
                  <Link className="btn btn-outline-secondary" to={HOME_LINKS.heroSafety}>{hero.safetyLink ?? HOME_HERO.safetyLink}</Link>
                </div>
                <div className="row g-3">
                  {(hero.stats ?? []).map(s => (
                    <div key={s.label} className="col-sm-4">
                      <div className="bugie-hero-stat">
                        <strong>{s.value}</strong>
                        <span>{s.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <PhoneMockup phone={phone} />
            </div>
          </div>
          <div className="mt-4 pt-2" data-reveal>
            <div className="bugie-marquee">
              <div className="bugie-marquee-track">
                {marqueeItems.map((item, i) => (
                  <span className="bugie-marquee-item" key={`${item}-${i}`}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
