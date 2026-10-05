import { useState } from 'react';
import { useLandingContent } from '../../hooks/useLandingContent';
import { CONTACT, CONTACT_STATIC } from '../../content/landing/contact';
import { LANDING_API } from '../../content/landing/api';
import LandingPage from '../../components/landing/LandingPage';
import Eyebrow from '../../components/landing/Eyebrow';
import IconListItem from '../../components/landing/IconListItem';
import TitledCard from '../../components/landing/TitledCard';

const EMPTY_FORM = { name: '', email: '', subject: 'general', message: '' };

/** /contacto. Textos en src/content/landing/contact.ts (sección 'contact'). */
export default function Contact() {
  const { section } = useLandingContent();
  const d = section('contact', CONTACT);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const set = (f: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      // Convertimos el value técnico (ej "driver") al label legible
      // (ej "Quiero ser conductor") antes de enviarlo. El admin ve eso.
      const selected = (d.subjects ?? []).find(s => s.value === form.subject);
      const subjectLabel = selected?.label ?? form.subject;
      const payload = { ...form, subject: subjectLabel };

      const res = await fetch(`${LANDING_API}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? CONTACT_STATIC.sendError);
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? CONTACT_STATIC.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LandingPage>
      <div className="row g-4">
        <div className="col-lg-5" data-reveal>
          <div className="bugie-shell-card h-100">
            <Eyebrow>{d.eyebrow}</Eyebrow>
            <h1 className="bugie-h2 mb-3">{d.title}</h1>
            <p className="bugie-muted mb-4">{d.subtitle}</p>
            <div className="d-grid gap-3">
              {(d.info ?? []).map(item => (
                <IconListItem key={item.title} icon={item.icon} title={item.title} text={item.desc} />
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-7" data-reveal>
          <TitledCard title={d.formTitle} bodyClassName="p-4">
            {sent ? (
              <div className="text-center py-4">
                <i className="fa-solid fa-circle-check fa-3x text-success mb-3 d-block" />
                <div className="fw-bold fs-5 mb-2">{d.successTitle}</div>
                <div className="bugie-muted small">{d.successText}</div>
                <button className="btn btn-bugie-outline mt-4"
                  onClick={() => { setSent(false); setForm(EMPTY_FORM); }}>
                  {d.sendAnotherLabel}
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">{d.nameLabel}</label>
                  <input className="form-control" placeholder={d.namePlaceholder}
                    value={form.name} onChange={set('name')} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label">{d.emailLabel}</label>
                  <input className="form-control" type="email" placeholder={d.emailPlaceholder}
                    value={form.email} onChange={set('email')} required />
                </div>
                <div className="col-12">
                  <label className="form-label">{d.subjectLabel}</label>
                  <select className="form-select" value={form.subject} onChange={set('subject')}>
                    {(d.subjects ?? []).map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label">{d.messageLabel}</label>
                  <textarea className="form-control" rows={4}
                    placeholder={d.messagePlaceholder}
                    value={form.message} onChange={set('message')} required minLength={10} />
                </div>
                {error && (
                  <div className="col-12">
                    <div className="alert alert-danger small mb-0">
                      <i className="fa-solid fa-circle-exclamation me-2" />{error}
                    </div>
                  </div>
                )}
                <div className="col-12 d-flex justify-content-end">
                  <button className="btn btn-bugie text-white px-4" type="submit" disabled={loading}>
                    {loading
                      ? <><span className="spinner-border spinner-border-sm me-2" />{CONTACT_STATIC.sending}</>
                      : <><i className="fa-solid fa-paper-plane me-2" />{d.sendLabel}</>
                    }
                  </button>
                </div>
              </form>
            )}
          </TitledCard>
        </div>
      </div>
    </LandingPage>
  );
}
