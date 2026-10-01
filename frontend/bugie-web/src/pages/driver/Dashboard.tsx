import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';
import { getUser } from '../../state/session';

interface DriverProfile { id: string; status: number; isOnline: boolean; }
interface ActiveTrip    { id: string; originAddress: string; destAddress: string; status: number; }
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

  const approved = driver?.status === 3;
  const docsToShow = upcoming?.documents ?? [];

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.fullName?.split(' ')[0] ?? 'conductor'}`}
        subtitle="Tu centro de operación como conductor Bugie."
        icon="fa-solid fa-car-side"
        actions={
          approved
            ? <Link className="btn btn-light rounded-pill fw-bold" to="/app/conductor/en-linea">
                {driver?.isOnline ? 'Desconectarme' : 'Conectarme'}
              </Link>
            : undefined
        }
      />

      {/* Viaje activo */}
      {!loading && activeTrip && (
        <div className="alert alert-info d-flex align-items-center gap-3 mb-3">
          <i className="fa-solid fa-route fa-lg" />
          <div className="flex-grow-1">
            <div className="fw-bold">{STATUS_MSG[activeTrip.status] ?? 'Viaje activo'}</div>
            <div className="small">{activeTrip.originAddress} → {activeTrip.destAddress}</div>
          </div>
          <Link className="btn btn-sm btn-primary rounded-pill" to="/app/conductor/viaje">Ver</Link>
        </div>
      )}

      {/* Banner de documentos próximos a caducar */}
      {!loading && approved && docsToShow.length > 0 && (
        <UpcomingExpirationsBanner
          docs={docsToShow}
          thresholdDays={upcoming?.thresholdDays ?? 15}
        />
      )}

      {/* Estado si no aprobado */}
      {!loading && driver && !approved && (
        <div className="alert alert-warning mb-3">
          <i className="fa-solid fa-triangle-exclamation me-2" />
          Tu cuenta está pendiente de aprobación. Completa tus documentos para empezar a recibir viajes.
          <div className="mt-2">
            <Link className="btn btn-sm btn-warning rounded-pill" to="/app/conductor/documentos">Ir a documentos</Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="row g-3 mb-3">
        {[
          ['Estado',            loading ? '…' : (driver?.isOnline ? 'En línea' : 'Desconectado')],
          ['Ganancia este mes', loading ? '…' : `S/ ${earnings?.earningsThisMonth.toFixed(2) ?? '0.00'}`],
          ['Viajes totales',    loading ? '…' : String(earnings?.totalTrips ?? 0)],
        ].map(([label, value]) => (
          <div className="col-md-4" key={label}>
            <div className="bugie-kpi">
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="bugie-card">
        <div className="bugie-card-header">Acciones rápidas</div>
        <div className="bugie-card-body d-grid gap-2">
          {[
            { to: '/app/conductor/en-linea',    icon: 'fa-circle-dot',     label: 'Cambiar disponibilidad', desc: 'Conectarte o desconectarte'  },
            { to: '/app/conductor/solicitudes', icon: 'fa-bell',           label: 'Ver solicitudes',        desc: 'Viajes pendientes de aceptar' },
            { to: '/app/conductor/viaje',       icon: 'fa-car',            label: 'Viaje en curso',         desc: 'Continuar el viaje activo'   },
            { to: '/app/conductor/ganancias',   icon: 'fa-wallet',         label: 'Mis ganancias',          desc: 'Ingresos y resumen financiero' },
            { to: '/app/conductor/documentos',  icon: 'fa-id-card',        label: 'Documentos',             desc: 'Estado de verificación'      },
            { to: '/app/conductor/sos',         icon: 'fa-shield-halved',  label: 'SOS / Emergencia',       desc: 'Activar alerta en ruta'      },
          ].map(item => (
            <Link key={item.to} to={item.to} className="bugie-list-item text-decoration-none">
              <div className="bugie-mini-icon"><i className={`fa-solid ${item.icon}`} /></div>
              <div className="flex-grow-1">
                <div className="fw-semibold">{item.label}</div>
                <div className="small bugie-muted">{item.desc}</div>
              </div>
              <i className="fa-solid fa-chevron-right bugie-muted" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Banner de documentos próximos a caducar
// ─────────────────────────────────────────────────────────────────────
function UpcomingExpirationsBanner({ docs, thresholdDays }: {
  docs: UpcomingDoc[]; thresholdDays: number;
}) {
  // Día mínimo que falta → define la urgencia visual
  const minDays = Math.min(...docs.map(d => d.daysUntilExpiry));
  const isUrgent = minDays <= 3;
  const color = isUrgent ? '#ef4444' : '#f59e0b';

  return (
    <div
      className="mb-3 p-3"
      style={{
        background: color + '15',
        border: `1px solid ${color}55`,
        borderRadius: 12,
      }}
    >
      <div className="d-flex align-items-start gap-3">
        <div className="d-flex align-items-center justify-content-center flex-shrink-0"
             style={{ width: 40, height: 40, borderRadius: '50%', background: color + '22' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ color, fontSize: 18 }} />
        </div>
        <div className="flex-grow-1">
          <div className="fw-bold mb-1" style={{ color }}>
            {isUrgent ? '¡Atención! Documentos por caducar pronto' : 'Tienes documentos próximos a caducar'}
          </div>
          <div className="small mb-2">
            En los próximos <strong>{thresholdDays} días</strong> caducan estos documentos. Renuévalos a tiempo
            para evitar que tu cuenta pase a pendiente de revisión.
          </div>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {docs.map(doc => {
              const label = DOC_LABEL[doc.docType] ?? doc.docType;
              const dayText = doc.daysUntilExpiry === 0  ? 'caduca hoy'
                            : doc.daysUntilExpiry === 1  ? 'caduca mañana'
                            : `en ${doc.daysUntilExpiry} días`;
              return (
                <span key={doc.documentId} className="badge rounded-pill"
                      style={{ background: color + '22', color, fontSize: '0.75rem' }}>
                  <i className="fa-solid fa-calendar-day me-1" style={{ fontSize: '0.7rem' }} />
                  {label}: {dayText}
                </span>
              );
            })}
          </div>
          <Link
            to="/app/conductor/documentos"
            className="btn btn-sm rounded-pill text-white"
            style={{ background: color }}
          >
            <i className="fa-solid fa-arrow-right me-1" />Ir a renovar documentos
          </Link>
        </div>
      </div>
    </div>
  );
}