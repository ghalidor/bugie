import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ServiceIcon from '../../components/ServiceIcon';
import DriverAccountStatus, { DriverAccountInfo } from '../../components/DriverAccountStatus';
import { API, apiFetch } from '../../state/api';
import { getUser } from '../../state/session';
import { CountUp, InfoList, Notice, Page, SectionCard, StatCard, StatGrid, StatusBadge } from '../../components/ui';
import { money } from '../../components/tripFormat';

interface DriverProfile extends DriverAccountInfo { id: string; status: number; isOnline: boolean; }
// serviceType: 0 = viaje, 1 = envío
interface ActiveTrip    { id: string; originAddress: string; destAddress: string; status: number; serviceType?: number; passengerName?: string | null; }
interface Earnings      { totalEarnings: number; totalTrips: number; earningsThisMonth: number; }

interface UpcomingDoc {
  documentId:      string;
  docType:         string;
  expiresAt:       string;
  daysUntilExpiry: number;
}
interface UpcomingResponse {
  thresholdDays: number;
  documents:     UpcomingDoc[];
}

const STATUS_MSG: Record<number, string> = {
  1: 'Buscando pasajero…', 2: 'Aceptado — en camino',
  3: 'Viaje en curso', 4: 'Completado', 5: 'Cancelado', 6: 'SOS activo',
};

const DOC_LABEL: Record<string, string> = {
  license:          'Licencia de conducir',
  soat:             'SOAT',
  revision_tecnica: 'Revisión técnica',
};

const QUICK = [
  { to: '/app/conductor/viajes',         icon: 'fa-clock-rotate-left', label: 'Historial',          desc: 'Viajes pasados y su recorrido' },
  { to: '/app/conductor/ganancias',      icon: 'fa-wallet',            label: 'Mis ganancias',      desc: 'Ingresos, billetera y comisión' },
  { to: '/app/conductor/calificaciones', icon: 'fa-star-half-stroke',  label: 'Mis calificaciones', desc: 'Lo que opinan tus pasajeros' },
  { to: '/app/conductor/puntos',         icon: 'fa-star',              label: 'Mis puntos',         desc: 'Saldo y nivel' },
  { to: '/app/conductor/documentos',     icon: 'fa-id-card',           label: 'Documentos',         desc: 'Estado de verificación' },
  { to: '/app/conductor/sos',            icon: 'fa-shield-halved',     label: 'SOS / Emergencia',   desc: 'Activar alerta en ruta', danger: true },
];

export default function DriverDashboard() {
  const user = getUser();
  const [driver,     setDriver]     = useState<DriverProfile | null>(null);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [earnings,   setEarnings]   = useState<Earnings | null>(null);
  const [upcoming,   setUpcoming]   = useState<UpcomingResponse | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.allSettled([
      apiFetch<DriverProfile>(`${API.drivers}/drivers/me`),
      apiFetch<ActiveTrip | null>(`${API.trips}/trips/active`),
      apiFetch<Earnings>(`${API.payments}/payments/earnings`),
      apiFetch<UpcomingResponse>(`${API.drivers}/drivers/me/upcoming-expirations`),
    ]).then(([d, trip, earn, upc]) => {
      if (d.status    === 'fulfilled') setDriver(d.value);
      if (trip.status === 'fulfilled') setActiveTrip(trip.value);
      if (earn.status === 'fulfilled') setEarnings(earn.value);
      if (upc.status  === 'fulfilled') setUpcoming(upc.value);
    }).finally(() => setLoading(false));
  }, []);

  // Recarga solo el conductor (tras pedir una revisión).
  function reloadDriver() {
    apiFetch<DriverProfile>(`${API.drivers}/drivers/me`).then(setDriver).catch(() => { /* se verá al recargar */ });
  }

  const approved = driver?.status === 3;
  // Suspendido o rechazado: tiene su propia tarjeta.
  const blocked  = driver?.status === 4 || driver?.status === 5;
  const docsToShow = upcoming?.documents ?? [];
  const tripDelivery = activeTrip?.serviceType === 1;

  return (
    <Page
      title={`Hola, ${user?.fullName?.split(' ')[0] ?? 'conductor'}`}
      subtitle="Consulta tu actividad. Para conectarte y tomar viajes usa la app Bugie."
      icon="fa-gauge"
      extra={!loading && driver && (
        <StatusBadge tone={driver.isOnline ? 'ok' : 'neutral'} dot>
          {driver.isOnline ? 'En línea' : 'Desconectado'}
        </StatusBadge>
      )}
    >
      {/* Cuenta suspendida o rechazada: motivo y solicitud de revisión */}
      {!loading && driver && blocked && <DriverAccountStatus driver={driver} onChanged={reloadDriver} />}

      {/* Cuenta no aprobada */}
      {!loading && driver && !approved && !blocked && (
        <Notice
          tone="warn"
          title="Tu cuenta está pendiente de aprobación"
          action={<Link className="btn btn-sm btn-bugie" to="/app/conductor/documentos">Ir a documentos</Link>}
        >
          Completa tus documentos para empezar a recibir viajes.
        </Notice>
      )}

      {/* Documentos próximos a caducar */}
      {!loading && approved && docsToShow.length > 0 && (
        <UpcomingExpirationsBanner docs={docsToShow} thresholdDays={upcoming?.thresholdDays ?? 15} />
      )}

      <StatGrid min={170}>
        <StatCard
          label="Estado"
          value={driver?.isOnline ? 'En línea' : 'Desconectado'}
          icon="fa-signal"
          tone={driver?.isOnline ? 'ok' : 'neutral'}
          hint="Se cambia desde la app"
          pulse={!!driver?.isOnline}
          loading={loading}
        />
        <StatCard label="Ganancia este mes" value={<CountUp value={earnings?.earningsThisMonth} format={money} decimals={2} />} icon="fa-calendar" tone="info" loading={loading} to="/app/conductor/ganancias" />
        <StatCard label="Ganancia total" value={<CountUp value={earnings?.totalEarnings} format={money} decimals={2} />} icon="fa-wallet" loading={loading} to="/app/conductor/ganancias" />
        <StatCard label="Viajes totales" value={<CountUp value={earnings?.totalTrips ?? 0} />} icon="fa-route" tone="ok" loading={loading} to="/app/conductor/viajes" />
      </StatGrid>

      {/* Viaje activo (iniciado en la app), solo lectura */}
      {!loading && activeTrip && (
        <SectionCard
          title={tripDelivery && activeTrip.status === 3
            ? 'Envío en curso'
            : (STATUS_MSG[activeTrip.status] ?? (tripDelivery ? 'Envío activo' : 'Viaje activo'))}
          icon={tripDelivery ? 'fa-box' : 'fa-car'}
          description="Solo lectura: gestiónalo desde la app Bugie."
          actions={<ServiceIcon delivery={tripDelivery} />}
        >
          <div className="bx-stack">
            <ol className="bx-stops">
              <li><span className="lbl">Origen</span><span className="addr">{activeTrip.originAddress}</span></li>
              <li className="dest"><span className="lbl">Destino</span><span className="addr">{activeTrip.destAddress}</span></li>
            </ol>
            {activeTrip.passengerName && (
              <InfoList items={[{ label: 'Pasajero', value: activeTrip.passengerName }]} />
            )}
          </div>
        </SectionCard>
      )}

      <div className="bx-split">
        <SectionCard title="Accesos rápidos" icon="fa-bolt" flush>
          <div className="bx-list">
            {QUICK.map(item => (
              <Link key={item.to} to={item.to} className="bx-list-item">
                <span className={`bx-list-icon ${item.danger ? 'bx-tone-bad' : ''}`} aria-hidden="true"><i className={`fa-solid ${item.icon}`} /></span>
                <span className="bx-list-text">
                  <span className="bx-list-title">{item.label}</span>
                  <span className="bx-list-sub d-block">{item.desc}</span>
                </span>
                <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="La web es de consulta" icon="fa-mobile-screen">
          <ul className="bx-tip-list">
            <li><i className="fa-solid fa-toggle-on" aria-hidden="true" /><div><div className="t">Conectarte</div><div className="d">Activa tu disponibilidad desde la app Bugie.</div></div></li>
            <li><i className="fa-solid fa-bell" aria-hidden="true" /><div><div className="t">Recibir solicitudes</div><div className="d">Las propuestas y viajes llegan a la app.</div></div></li>
            <li><i className="fa-solid fa-fingerprint" aria-hidden="true" /><div><div className="t">Face ID diario</div><div className="d">Confirma tu identidad cada jornada en la app.</div></div></li>
            <li><i className="fa-solid fa-chart-line" aria-hidden="true" /><div><div className="t">Aquí en la web</div><div className="d">Revisa ganancias, historial, documentos y perfil.</div></div></li>
          </ul>
        </SectionCard>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Aviso de documentos próximos a caducar
// ─────────────────────────────────────────────────────────────────────
function UpcomingExpirationsBanner({ docs, thresholdDays }: {
  docs: UpcomingDoc[]; thresholdDays: number;
}) {
  // Día mínimo que falta → define la urgencia visual
  const minDays = Math.min(...docs.map(d => d.daysUntilExpiry));
  const isUrgent = minDays <= 3;

  return (
    <Notice
      tone={isUrgent ? 'bad' : 'warn'}
      icon="fa-triangle-exclamation"
      title={isUrgent ? '¡Atención! Documentos por caducar pronto' : 'Tienes documentos próximos a caducar'}
      action={
        <Link to="/app/conductor/documentos" className={`btn btn-sm ${isUrgent ? 'btn-danger' : 'btn-warning'}`}>
          <i className="fa-solid fa-arrow-right" aria-hidden="true" />Renovar documentos
        </Link>
      }
    >
      En los próximos <strong>{thresholdDays} días</strong> caducan estos documentos. Renuévalos a tiempo
      para evitar que tu cuenta pase a pendiente de revisión.
      <div className="d-flex flex-wrap gap-2 mt-2">
        {docs.map(doc => {
          const label = DOC_LABEL[doc.docType] ?? doc.docType;
          const dayText = doc.daysUntilExpiry === 0  ? 'caduca hoy'
                        : doc.daysUntilExpiry === 1  ? 'caduca mañana'
                        : `en ${doc.daysUntilExpiry} días`;
          return (
            <StatusBadge key={doc.documentId} tone={isUrgent ? 'bad' : 'warn'} icon="fa-calendar-day">
              {label}: {dayText}
            </StatusBadge>
          );
        })}
      </div>
    </Notice>
  );
}
