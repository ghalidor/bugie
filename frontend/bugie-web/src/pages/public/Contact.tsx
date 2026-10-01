import { useOutletContext } from 'react-router-dom';
import { useLanding, parse } from '../../hooks/useLanding';
import { useState } from 'react';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const FALLBACK = {
  eyebrow: 'Contacto',
  title: 'Conversemos sobre Bugie y cómo podemos ayudarte.',
  subtitle: '¿Quieres ser conductor, tienes una alianza o necesitas soporte? Escríbenos directamente.',
  formTitle: 'Escríbenos',
  successTitle: '¡Mensaje enviado!',
  successText: 'Gracias por contactarnos. Te responderemos pronto.',
  sendAnotherLabel: 'Enviar otro mensaje',
  sendLabel: 'Enviar mensaje',
  namePlaceholder: 'Tu nombre completo',
  emailPlaceholder: 'correo@ejemplo.com',
  messagePlaceholder: 'Cuéntanos qué necesitas (mínimo 10 caracteres)',
  nameLabel: 'Nombre', emailLabel: 'Correo', subjectLabel: 'Motivo', messageLabel: 'Mensaje',
  subjects: [
    { value: 'general',  label: 'Consulta general' },
    { value: 'alliance', label: 'Alianza comercial' },
    { value: 'driver',   label: 'Quiero ser conductor' },
    { value: 'support',  label: 'Soporte técnico' },
  ],
  info: [
    { icon: 'fa-location-dot', title: 'Trujillo, Perú',    desc: 'Cobertura inicial del servicio.' },
    { icon: 'fa-envelope',     title: 'hola@bugie.pe',      desc: 'Respuesta en menos de 24 horas.' },
    { icon: 'fa-headset',      title: 'Soporte y alianzas', desc: 'Canal preparado para operaciones.' },
  ],
};

export default function Contact() {
  const ctx = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data } = useLanding(lang);
  const d = parse(data?.sections ?? [], 'contact', FALLBACK);

  const [form, setForm] = useState({ name: '', email: '', subject: 'general', message: '' });
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
      const selected = (d.subjects ?? []).find((s: any) => s.value === form.subject);
      const subjectLabel = selected?.label ?? form.subject;
      const payload = { ...form, subject: subjectLabel };

      const res = await fetch(`${import.meta.env.VITE_API_LANDING}/landing/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Error al enviar.');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? 'No se pudo enviar. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">

        <div className="row g-4">
          <div className="col-lg-5" data-reveal>
            <div className="bugie-shell-card h-100">
              <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{d.eyebrow}</div>
              <h1 className="bugie-h2 mb-3">{d.title}</h1>
              <p className="bugie-muted mb-4">{d.subtitle}</p>
              <div className="d-grid gap-3">
                {(d.info ?? []).map((item: any) => (
                  <div key={item.title} className="bugie-list-item">
                    <div className="bugie-mini-icon"><i className={`fa-solid ${item.icon}`} /></div>
                    <div>
                      <div className="fw-semibold">{item.title}</div>
                      <div className="small bugie-muted">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-lg-7" data-reveal>
            <div className="bugie-card">
              <div className="bugie-card-header">{d.formTitle}</div>
              <div className="bugie-card-body p-4">
                {sent ? (
                  <div className="text-center py-4">
                    <i className="fa-solid fa-circle-check fa-3x text-success mb-3 d-block" />
                    <div className="fw-bold fs-5 mb-2">{d.successTitle}</div>
                    <div className="bugie-muted small">{d.successText}</div>
                    <button className="btn btn-bugie-outline mt-4"
                      onClick={() => { setSent(false); setForm({ name:'', email:'', subject:'general', message:'' }); }}>
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
                        {(d.subjects ?? []).map((s: any) => (
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
                          ? <><span className="spinner-border spinner-border-sm me-2" />Enviando…</>
                          : <><i className="fa-solid fa-paper-plane me-2" />{d.sendLabel}</>
                        }
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}