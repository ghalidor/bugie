import { useOutletContext } from 'react-router-dom';
import { useLanding, parse } from '../../hooks/useLanding';

const FALLBACK = {
  eyebrow: 'Empresa',
  title: 'Bugie nace para elevar la seguridad en la movilidad urbana de Trujillo.',
  description: 'Somos InteliaDevs S.A.C. — un equipo de ingenieros trujillanos construyendo una plataforma que pone la seguridad primero.',
  missionTitle: 'Misión', mission: 'Construir una experiencia de transporte más segura y confiable para Trujillo.',
  visionTitle:  'Visión',  vision:  'Ser la referencia en movilidad segura en el norte del Perú.',
  problemsTitle: 'El problema que resolvemos',
  problems: [
    { iconClass: 'fa-triangle-exclamation text-danger', title: 'Crisis de confianza',     text: '~30,000 taxis sin verificación.' },
    { iconClass: 'fa-user-slash text-warning',          title: 'Conductores sin validar', text: 'Sin antecedentes ni licencias.' },
    { iconClass: 'fa-eye-slash text-info',              title: 'Ausencia de monitoreo',   text: 'Sin trazabilidad de rutas.' },
    { iconClass: 'fa-shield-halved text-success',       title: 'La solución Bugie',       text: 'Verificación + monitoreo + SOS.' },
  ],
  teamTitle: 'Equipo',
  team: [
    { name: 'José Ishikawa',  role: 'Gerente de Proyecto', icon: 'fa-user-tie' },
    { name: 'Richard Blanco', role: 'Arquitecto Software',  icon: 'fa-code' },
    { name: 'Equipo Dev',     role: '2 Full Stack + 1 QA',  icon: 'fa-users' },
  ],
};

export default function Company() {
  const ctx = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data } = useLanding(lang);
  const d = parse(data?.sections ?? [], 'company', FALLBACK);

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">
        {/* Selector de idioma */}

        <div className="row g-4 align-items-start">
          <div className="col-lg-5" data-reveal>
            <div className="bugie-shell-hero">
              <div className="text-uppercase small fw-bold text-bugie-accent">{d.eyebrow}</div>
              <h1 className="bugie-h2 mb-0">{d.title}</h1>
              <p className="description mb-0">{d.description}</p>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="row g-4">
              <div className="col-md-6" data-reveal>
                <div className="bugie-card h-100">
                  <div className="bugie-card-header">{d.missionTitle}</div>
                  <div className="bugie-card-body">{d.mission}</div>
                </div>
              </div>
              <div className="col-md-6" data-reveal>
                <div className="bugie-card h-100">
                  <div className="bugie-card-header">{d.visionTitle}</div>
                  <div className="bugie-card-body">{d.vision}</div>
                </div>
              </div>
              <div className="col-12" data-reveal>
                <div className="bugie-card">
                  <div className="bugie-card-header">{d.problemsTitle}</div>
                  <div className="bugie-card-body">
                    <div className="row g-3">
                      {(d.problems ?? []).map((p: any) => (
                        <div className="col-md-6" key={p.title}>
                          <div className="bugie-feature h-100">
                            <i className={`fa-solid ${p.iconClass} mb-2 d-block`} style={{ fontSize: '1.4rem' }} />
                            <div className="fw-bold mb-1">{p.title}</div>
                            <div className="small bugie-muted">{p.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12" data-reveal>
                <div className="bugie-card">
                  <div className="bugie-card-header">{d.teamTitle}</div>
                  <div className="bugie-card-body">
                    <div className="row g-3">
                      {(d.team ?? []).map((m: any) => (
                        <div className="col-md-4" key={m.name}>
                          <div className="bugie-list-item">
                            <div className="bugie-mini-icon"><i className={`fa-solid ${m.icon}`} /></div>
                            <div>
                              <div className="fw-semibold small">{m.name}</div>
                              <div className="small bugie-muted">{m.role}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
