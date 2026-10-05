import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { parse } from '../hooks/useLanding';
import { fillCity, useCity } from '../hooks/useCity';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const FALLBACK = {
  eyebrow: 'Acceso por rol',
  title: 'Ingresa a la plataforma de transporte seguro de {city}.',
  subtitle: 'Desde aquí se separan los flujos de pasajero y conductor. El panel admin queda fuera para aislar responsabilidades.',
  chipLabel: 'Transporte seguro',
  features: [
    { icon: 'fa-shield-halved',         title: 'Conductores verificados',  text: 'Documentos y antecedentes revisados en persona, y selfie registrada al conectarse.' },
    { icon: 'fa-location-dot',          title: 'Seguimiento en tiempo real', text: 'Trazabilidad activa del viaje para pasajero y conductor.' },
    { icon: 'fa-triangle-exclamation',  title: 'Botón SOS',                 text: 'Alerta directa al centro de monitoreo y a los administradores.' },
    { icon: 'fa-mobile-screen-button',  title: 'App para todos',            text: 'Pasajero, conductor y admin con flujos propios.' },
  ],
  chips: ['Pasajero', 'Conductor', 'Admin separado'],
};

export default function AuthLayout() {
  const [raw, setD] = useState(FALLBACK);
  // {city} se rellena con la ciudad configurada (ver hooks/useCity.ts).
  const city = useCity();
  const d = fillCity(raw, city);

  useEffect(() => {
    fetch(`${LANDING_API}?lang=es`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sections) setD(parse(data.sections, 'auth', FALLBACK));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="bugie-auth-shell">
      <div className="container bugie-container">
        <div className="row g-4 align-items-stretch">

          {/* Panel izquierdo */}
          <div className="col-lg-7 d-none d-lg-block">
            <div className="bugie-auth-left h-100">
              <div className="bugie-auth-left-bg" aria-hidden="true" />
              <div className="position-relative h-100 d-flex flex-column">
                <div className="d-flex align-items-center justify-content-between mb-4">
                  <Link to="/" className="text-decoration-none">
                    <span className="bugie-brand fs-4 text-white">Bugie</span>
                  </Link>
                  <span className="bugie-chip border-0" style={{ background: 'rgba(255,255,255,.12)', color: 'white' }}>
                    <i className="fa-solid fa-shield-halved text-bugie-accent" /> {d.chipLabel}
                  </span>
                </div>

                <div className="bugie-auth-stack">
                  <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{d.eyebrow}</div>
                  <h1 className="bugie-h2 mb-3">{d.title}</h1>
                  <p className="bugie-lead mb-4 text-white-50">{d.subtitle}</p>

                  <div className="row g-3 mb-4">
                    {(d.features ?? []).map((f: any) => (
                      <div className="col-md-6" key={f.title}>
                        <div className="bugie-auth-feature h-100">
                          <div className="bugie-mini-icon" style={{ background: 'rgba(255,255,255,.1)', color: 'white', borderColor: 'rgba(255,255,255,.15)' }}>
                            <i className={`fa-solid ${f.icon}`} />
                          </div>
                          <div>
                            <div className="fw-bold">{f.title}</div>
                            <div className="small text-white-50">{f.text}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bugie-auth-panel mt-auto">
                    <div className="d-flex flex-wrap gap-2">
                      {(d.chips ?? []).map((chip: string) => (
                        <span key={chip} className="bugie-chip border-0" style={{ background: 'rgba(255,255,255,.1)', color: 'white' }}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Panel derecho — formulario */}
          <div className="col-12 col-lg-5">
            <div className="bugie-auth-right h-100">
              <div className="d-flex align-items-center justify-content-between mb-4">
                <Link to="/" className="text-decoration-none d-lg-none">
                  <span className="bugie-brand">Bugie</span>
                </Link>
                <span className="bugie-chip">
                  <i className="fa-solid fa-shield-halved text-bugie-accent" /> Bugie
                </span>
              </div>
              <div className="bugie-auth-stack">
                <Outlet />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
