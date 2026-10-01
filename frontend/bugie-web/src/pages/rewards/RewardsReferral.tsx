import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { rewardsApi, MyReferral, fmtPoints, fmtDate } from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Invita y gana.

   El código es fijo: el mismo siempre, para compartir por donde sea. Se crea
   la primera vez que se abre esta pantalla, no al registrarse, así no se
   generan códigos para cuentas que nunca van a invitar.
   ────────────────────────────────────────────────────────────────────────── */

export default function RewardsReferral() {
  const [data,    setData]    = useState<MyReferral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [email,   setEmail]   = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  function load() {
    setLoading(true); setError(null);
    rewardsApi.myReferral()
      .then(setData)
      .catch(e => setError(e instanceof ApiError
        ? e.message
        : 'No se pudo cargar tu código de invitación.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function copiar() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // El navegador no dio permiso: el código igual está a la vista.
    }
  }

  async function invitar() {
    setSending(true); setError(null); setSent(null);
    try {
      await rewardsApi.invite(email.trim());
      setSent(email.trim());
      setEmail('');
      load();   // para que la lista de invitados se actualice
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la invitación.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (!data) {
    return <div className="alert alert-danger small">{error ?? 'No se pudo cargar.'}</div>;
  }
  if (!data.enabled) {
    return (
      <div className="bugie-card">
        <div className="bugie-card-body text-center py-4 bugie-muted">
          El programa de invitaciones no está activo por ahora.
        </div>
      </div>
    );
  }

  return (
    <div className="row g-3">
      {/* ── El código ── */}
      <div className="col-12 col-lg-6">
        <div className="bugie-card h-100">
          <div className="bugie-card-header">
            <i className="fa-solid fa-user-plus me-2" />Tu código
          </div>
          <div className="bugie-card-body">
            <div className="text-center p-4 mb-3" style={{
              background: 'var(--bugie-bg-2, rgba(125,125,160,.08))',
              borderRadius: 14,
              border: '1px dashed var(--bugie-border)',
            }}>
              <div style={{
                fontSize: '2.1rem', fontWeight: 800, letterSpacing: '.18em',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'var(--bugie-primary)',
              }}>
                {data.code}
              </div>
              <button type="button" onClick={copiar}
                      className="btn btn-sm btn-bugie-outline rounded-pill mt-3">
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} me-1`} />
                {copied ? 'Copiado' : 'Copiar código'}
              </button>
            </div>

            <div className="small bugie-muted mb-3">
              Compártelo por donde quieras. Quien lo use al <strong>crear su cuenta</strong> te
              hace ganar puntos.
            </div>

            <ul className="small mb-0 ps-3">
              <li>
                Te damos <strong>{fmtPoints(data.pointsPerPassenger)} puntos</strong> cuando
                un pasajero se registra con tu código.
              </li>
              <li>
                <strong>{fmtPoints(data.pointsPerDriver)} puntos</strong> si quien se registra
                es conductor.
              </li>
              {data.qualifyTrips > 0 && data.qualifyPoints > 0 && (
                <li>
                  <strong>{fmtPoints(data.qualifyPoints)} puntos extra</strong> cuando esa
                  persona completa {data.qualifyTrips} viajes.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Invitar por correo ── */}
      <div className="col-12 col-lg-6">
        <div className="bugie-card h-100">
          <div className="bugie-card-header">
            <i className="fa-solid fa-envelope me-2" />Invitar por correo
          </div>
          <div className="bugie-card-body">
            <div className="small bugie-muted mb-2">
              Le llega tu código listo para usar al registrarse.
            </div>

            <div className="input-group mb-2">
              <input className="form-control" type="email" placeholder="correo@ejemplo.com"
                     value={email} onChange={e => setEmail(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter' && email.trim()) invitar(); }} />
              <button type="button" className="btn btn-bugie"
                      onClick={invitar} disabled={sending || email.trim().length < 5}>
                {sending ? <span className="spinner-border spinner-border-sm" /> : 'Enviar'}
              </button>
            </div>

            {sent && (
              <div className="alert alert-success small py-2 mb-2">
                <i className="fa-solid fa-circle-check me-1" />
                Invitación enviada a {sent}.
              </div>
            )}
            {error && <div className="alert alert-danger small py-2 mb-2">{error}</div>}

            <div className="row g-2 mt-1">
              {[
                ['Invitados',  data.totalInvited],
                ['Activos',    data.qualified],
                ['Puntos ganados', data.pointsEarned],
              ].map(([label, value]) => (
                <div className="col-4" key={label as string}>
                  <div className="bugie-kpi text-center" style={{ minHeight: 'auto', padding: '.7rem' }}>
                    <div className="label">{label}</div>
                    <div className="value">{fmtPoints(value as number)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── A quiénes invité ── */}
      {data.people.length > 0 && (
        <div className="col-12">
          <div className="bugie-card">
            <div className="bugie-card-header">A quiénes invitaste</div>
            <div className="bugie-card-body">
              <div className="d-grid gap-2">
                {data.people.map((p, i) => {
                  const activo = p.status === 'qualified';
                  return (
                    <div key={i} className="d-flex align-items-center gap-3 py-1"
                         style={{ borderBottom: '1px solid var(--bugie-border)' }}>
                      <i className={`fa-solid ${p.userType === 'driver' ? 'fa-car-side' : 'fa-user'}`}
                         style={{ color: 'var(--bugie-muted)', width: 18 }} />
                      <div className="flex-grow-1">
                        <div className="small fw-semibold">
                          {p.userType === 'driver' ? 'Conductor' : 'Pasajero'}
                          <span className="fw-normal bugie-muted"> · se unió el {fmtDate(p.joinedAt)}</span>
                        </div>
                        <div className="small bugie-muted">
                          {activo
                            ? 'Ya completó sus viajes'
                            : data.qualifyTrips > 0
                            ? `${p.tripsCompleted} de ${data.qualifyTrips} viajes para el bono extra`
                            : `${p.tripsCompleted} viajes`}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="fw-bold" style={{ color: '#34d399' }}>
                          +{fmtPoints(p.pointsEarned)}
                        </div>
                        {!activo && data.qualifyTrips > 0 && (
                          <div className="small bugie-muted">pendiente el extra</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
