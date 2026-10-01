import { useOutletContext } from 'react-router-dom';
import BugieMap from '../../components/BugieMap';
import { useLanding, parse } from '../../hooks/useLanding';

const SAFE_SPOTS = [
  { lat: -8.109052, lng: -79.021534, label: 'Centro Trujillo',  type: 'origin'      as const },
  { lat: -8.114200, lng: -79.028000, label: 'Óvalo Grau',       type: 'destination' as const },
  { lat: -8.106500, lng: -79.014800, label: 'Av. Huanchaco',    type: 'default'     as const },
  { lat: -8.119000, lng: -79.035000, label: 'Víctor Larco',     type: 'driver'      as const },
];

const FALLBACK = {
  eyebrow: 'Seguridad',
  title: 'La seguridad de Bugie no es un feature — es la razón por la que existe.',
  subtitle: 'Verificación física, monitoreo continuo y respuesta coordinada.',
  mapLabel: 'Zonas de operación verificada en Trujillo',
  features: [
    { icon: 'fa-id-card',              title: 'Verificación presencial',         text: 'DNI, licencia, SOAT y antecedentes penales.' },
    { icon: 'fa-fingerprint',          title: 'Reconocimiento facial diario',     text: 'Validación biométrica antes de cada jornada.' },
    { icon: 'fa-location-dot',         title: 'Monitoreo 24/7',                  text: 'Rutas registradas en tiempo real.' },
    { icon: 'fa-triangle-exclamation', title: 'Botón SOS dual',                  text: 'Alerta conectada a monitoreo y Policía Nacional.' },
    { icon: 'fa-shield-halved',        title: 'Respuesta en menos de 2 minutos', text: 'Objetivo operativo de Bugie.' },
    { icon: 'fa-handshake',            title: 'Alianza táctica',                  text: 'Coordinación directa con Policía Nacional.' },
  ],
  stats: [
    { value: '5,000+', label: 'Conductores verificados' },
    { value: '24/7',   label: 'Monitoreo activo' },
    { value: '<2min',  label: 'Respuesta SOS' },
    { value: '100%',   label: 'Verificación presencial' },
  ],
};

export default function Safety() {
  const ctx = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data } = useLanding(lang);
  const d = parse(data?.sections ?? [], 'safety', FALLBACK);

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">

        <div className="row g-4 align-items-center mb-5">
          <div className="col-lg-6" data-reveal>
            <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{d.eyebrow}</div>
            <h1 className="bugie-h2 mb-3">{d.title}</h1>
            <p className="bugie-lead mb-0">{d.subtitle}</p>
          </div>
          <div className="col-lg-6" data-reveal>
            <BugieMap height={300} markers={SAFE_SPOTS} zoom={13} />
            <div className="small bugie-muted text-center mt-2">{d.mapLabel}</div>
          </div>
        </div>

        <div className="row g-4">
          {(d.features ?? []).map((f: any) => (
            <div className="col-md-6 col-xl-4" key={f.title} data-reveal>
              <div className="bugie-feature h-100">
                <div className="bugie-mini-icon mb-3"><i className={`fa-solid ${f.icon}`} /></div>
                <div className="fw-bold mb-2">{f.title}</div>
                <div className="small bugie-muted">{f.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="row g-3 mt-2">
          {(d.stats ?? []).map((s: any) => (
            <div className="col-6 col-md-3" key={s.label}>
              <div className="bugie-kpi text-center">
                <div className="value">{s.value}</div>
                <div className="label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}