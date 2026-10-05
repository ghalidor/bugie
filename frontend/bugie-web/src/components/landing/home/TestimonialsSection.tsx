import type { HOME_TESTIMONIALS } from '../../../content/landing/home';
import Eyebrow from '../Eyebrow';

/** Opiniones de pasajeros, conductores y operaciones. */
export default function TestimonialsSection({ testimonials }: { testimonials: typeof HOME_TESTIMONIALS }) {
  return (
    <section className="bugie-section-sm">
      <div className="container bugie-container">
        <div className="bugie-section-title">
          <Eyebrow>{testimonials.eyebrow}</Eyebrow>
          <h2 className="bugie-h2 mb-3">{testimonials.title}</h2>
        </div>
        <div className="row g-4">
          {(testimonials.items ?? []).map((t, i) => (
            <div className="col-lg-4" key={`${t.name}-${i}`}>
              <div className="bugie-testimonial">
                <div className="d-flex gap-1 text-warning mb-3">
                  {Array.from({ length: t.stars ?? 5 }).map((_, star) => (
                    <i className="fa-solid fa-star" key={star} />
                  ))}
                </div>
                <p className="mb-4">"{t.text}"</p>
                <div className="d-flex align-items-center gap-3">
                  <div className="bugie-avatar">{t.name[0]}</div>
                  <div>
                    <div className="fw-semibold">{t.name}</div>
                    <div className="small bugie-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
