import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import { rewardsAdminApi, ReferralStats, fmtPoints, fmtDate } from '../../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Referidos, vista del admin.

   La pregunta que responde esta pantalla es si el programa vale lo que cuesta:
   cuántos usuarios trajo, cuántos de ellos se quedaron, y cuántos puntos se
   regalaron para conseguirlo.
   ────────────────────────────────────────────────────────────────────────── */

export default function ReferralsTab() {
  const [data,    setData]    = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    rewardsAdminApi.referralStats()
      .then(setData)
      .catch(e => setError(e instanceof ApiError
        ? e.message
        : 'No se pudieron cargar los referidos.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (error || !data) {
    return <div className="alert alert-danger small">{error ?? 'No se pudo cargar.'}</div>;
  }

  // Dos tasas que dicen más que los totales sueltos.
  const tasaAceptacion = data.invitationsSent > 0
    ? Math.round(data.invitationsAccepted / data.invitationsSent * 100)
    : null;

  const tasaActivacion = data.totalReferrals > 0
    ? Math.round(data.qualified / data.totalReferrals * 100)
    : null;

  return (
    <>
      <div className="row g-3 mb-3">
        {[
          ['Usuarios traídos', fmtPoints(data.totalReferrals), 'Se registraron con un código'],
          ['Ya activos',       fmtPoints(data.qualified),      'Completaron los viajes de la meta'],
          ['Puntos regalados', fmtPoints(data.pointsGiven),    'Lo que costó el programa'],
          ['Códigos creados',  fmtPoints(data.codesIssued),    'Usuarios que abrieron Invita y gana'],
        ].map(([label, value, help]) => (
          <div className="col-6 col-xl-3" key={label}>
            <div className="bugie-kpi h-100">
              <div className="label">{label}</div>
              <div className="value">{value}</div>
              <div className="small bugie-muted mt-1" style={{ fontSize: '.72rem' }}>{help}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-envelope me-2" />Invitaciones por correo
            </div>
            <div className="bugie-card-body">
              <div className="d-flex align-items-baseline gap-3 mb-2">
                <span className="fw-bold" style={{ fontSize: '1.6rem' }}>
                  {fmtPoints(data.invitationsSent)}
                </span>
                <span className="bugie-muted small">enviadas</span>
                <span className="fw-bold ms-auto" style={{ fontSize: '1.6rem', color: '#34d399' }}>
                  {fmtPoints(data.invitationsAccepted)}
                </span>
                <span className="bugie-muted small">terminaron en registro</span>
              </div>

              {tasaAceptacion !== null ? (
                <>
                  <div className="progress" style={{ height: 8 }}>
                    <div className="progress-bar" style={{ width: `${tasaAceptacion}%`, background: '#34d399' }} />
                  </div>
                  <div className="small bugie-muted mt-2">
                    {tasaAceptacion}% de las invitaciones por correo terminaron en una cuenta nueva.
                  </div>
                </>
              ) : (
                <div className="small bugie-muted">
                  Todavía no se envió ninguna invitación por correo. El código también se
                  comparte por fuera, y esos casos no se cuentan acá.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-chart-simple me-2" />Qué tan bien funciona
            </div>
            <div className="bugie-card-body">
              {tasaActivacion !== null ? (
                <>
                  <div className="d-flex align-items-baseline gap-2 mb-2">
                    <span className="fw-bold" style={{ fontSize: '1.6rem' }}>{tasaActivacion}%</span>
                    <span className="bugie-muted small">
                      de los traídos completó los viajes de la meta
                    </span>
                  </div>
                  <div className="progress mb-3" style={{ height: 8 }}>
                    <div className="progress-bar" style={{ width: `${tasaActivacion}%` }} />
                  </div>
                  <div className="small bugie-muted">
                    {data.pending} {data.pending === 1 ? 'sigue' : 'siguen'} sin llegar a la meta.
                    Si ese número no baja, conviene revisar cuántos viajes estás pidiendo.
                  </div>
                </>
              ) : (
                <div className="small bugie-muted">
                  Todavía nadie se registró con un código.
                </div>
              )}

              {data.totalReferrals > 0 && (
                <div className="small bugie-muted mt-3 pt-3"
                     style={{ borderTop: '1px solid var(--bugie-border)' }}>
                  Costo por usuario traído:{' '}
                  <strong>
                    {fmtPoints(Math.round(data.pointsGiven / data.totalReferrals))} puntos
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bugie-card">
        <div className="bugie-card-header">
          <i className="fa-solid fa-trophy me-2" />Quiénes más invitan
        </div>
        <div className="bugie-card-body">
          {data.topReferrers.length === 0 ? (
            <div className="text-center py-4 bugie-muted small">
              Todavía nadie trajo usuarios con su código.
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {data.topReferrers.map((r, i) => (
                <div key={r.userId} className="d-flex align-items-center gap-3 py-2"
                     style={{ borderBottom: '1px solid var(--bugie-border)' }}>
                  <span className="fw-bold bugie-muted" style={{ width: 24 }}>{i + 1}</span>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="small fw-semibold text-truncate">
                      {r.fullName ?? 'Usuario sin nombre'}
                    </div>
                    <div className="small bugie-muted text-truncate">
                      {r.email ?? r.userId} · último el {fmtDate(r.lastAt)}
                    </div>
                  </div>
                  <div className="text-end small" style={{ minWidth: 110 }}>
                    <div><strong>{r.invited}</strong> invitados</div>
                    <div className="bugie-muted">{r.qualified} activos</div>
                  </div>
                  <div className="text-end fw-bold" style={{ minWidth: 80, color: '#34d399' }}>
                    +{fmtPoints(r.pointsEarned)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="small bugie-muted mt-3">
            Si un usuario aparece con muchos invitados y casi ninguno activo, puede estar
            creando cuentas para ganar puntos. Vale la pena mirarlo.
          </div>
        </div>
      </div>
    </>
  );
}
