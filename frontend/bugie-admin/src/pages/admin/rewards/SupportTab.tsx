import { useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, UserSearch, UserRewardsDetail,
  fmtPoints, fmtDate, describeReward, STATUS_LABEL, STATUS_COLOR,
} from '../../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Soporte: buscar a una persona y corregirle los puntos.

   Esta pantalla existe para no tener que entrar a producción con psql cada vez
   que alguien reclama. Un UPDATE a mano es lento, no deja rastro de quién lo
   hizo, y un WHERE mal puesto desordena los saldos de todos.

   Lo que NO se puede hacer acá, a propósito: borrar o editar movimientos. El
   libro de puntos es inmutable. Un error se corrige con un ajuste nuevo que
   queda registrado, igual que en contabilidad.
   ────────────────────────────────────────────────────────────────────────── */

const TX_LABEL: Record<string, string> = {
  earn:       'Ganó',
  redeem:     'Canjeó',
  expire:     'Vencieron',
  bonus:      'Devolución',
  adjust_add: 'Ajuste (+)',
  adjust_sub: 'Ajuste (−)',
};

const SOURCE_LABEL: Record<string, string> = {
  trip_completed:     'Viaje completado',
  rating:             'Calificación',
  referral:           'Referido',
  referral_qualified: 'Referido activo',
  streak:             'Racha',
  weekly_goal:        'Meta semanal',
  promotion:          'Promoción',
  catalog_redemption: 'Canje',
  redemption_refund:  'Canje anulado',
  points_expired:     'Vencimiento',
  admin_adjustment:   'Ajuste del admin',
};

export default function SupportTab() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<UserSearch[] | null>(null);
  const [detail,  setDetail]  = useState<UserRewardsDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function buscar() {
    if (query.trim().length < 3) {
      setError('Escribe al menos 3 letras para buscar.');
      return;
    }
    setLoading(true); setError(null); setDetail(null);
    try {
      setResults(await rewardsAdminApi.searchUsers(query.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo buscar.');
    } finally {
      setLoading(false);
    }
  }

  async function abrir(userId: string) {
    setLoading(true); setError(null);
    try {
      setDetail(await rewardsAdminApi.getUser(userId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el usuario.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="bugie-card mb-3">
        <div className="bugie-card-body">
          <div className="input-group">
            <span className="input-group-text">
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <input className="form-control" placeholder="Correo, nombre o teléfono"
                   value={query}
                   onChange={e => setQuery(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') buscar(); }} />
            <button type="button" className="btn btn-bugie" onClick={buscar} disabled={loading}>
              {loading ? <span className="spinner-border spinner-border-sm" /> : 'Buscar'}
            </button>
          </div>
          <div className="small bugie-muted mt-2">
            Busca en todas las cuentas, no solo en las que tienen puntos. Si alguien
            reclama que no le acreditaron nada, lo más probable es que todavía no
            tenga perfil, y así igual lo encuentras.
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {detail
        ? <UserDetail detail={detail} onBack={() => setDetail(null)} onReload={() => abrir(detail.user.userId)} />
        : results && <SearchResults results={results} onOpen={abrir} />}
    </>
  );
}

function SearchResults({ results, onOpen }: {
  results: UserSearch[]; onOpen: (id: string) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="bugie-card">
        <div className="bugie-card-body text-center py-4 bugie-muted">
          Ningún usuario coincide con esa búsqueda.
        </div>
      </div>
    );
  }

  return (
    <div className="bugie-card">
      <div className="bugie-card-header">{results.length} resultado{results.length === 1 ? '' : 's'}</div>
      <div className="bugie-card-body">
        <div className="d-flex flex-column gap-2">
          {results.map(u => (
            <button key={u.userId} type="button" onClick={() => onOpen(u.userId)}
                    className="d-flex align-items-center gap-3 p-2 text-start w-100"
                    style={{
                      background: 'transparent', border: '1px solid var(--bugie-border)',
                      borderRadius: 10, color: 'inherit',
                    }}>
              <i className={`fa-solid ${u.role === 'driver' ? 'fa-car-side' : 'fa-user'}`}
                 style={{ width: 18, color: 'var(--bugie-muted)' }} />
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div className="small fw-semibold text-truncate">
                  {u.fullName ?? 'Sin nombre'}
                </div>
                <div className="small bugie-muted text-truncate">
                  {u.email} {u.phone && `· ${u.phone}`}
                </div>
              </div>
              <div className="text-end">
                {u.hasProfile ? (
                  <>
                    <div className="fw-bold">{fmtPoints(u.availablePoints)}</div>
                    <div className="small bugie-muted">puntos</div>
                  </>
                ) : (
                  <span className="badge rounded-pill"
                        style={{ background: 'var(--bugie-warn)22', color: 'var(--bugie-warn)', fontSize: '.7rem' }}>
                    Sin puntos aún
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserDetail({ detail, onBack, onReload }: {
  detail: UserRewardsDetail; onBack: () => void; onReload: () => void;
}) {
  const u = detail.user;
  const p = detail.profile;

  return (
    <>
      <button type="button" onClick={onBack}
              className="btn btn-sm btn-bugie-outline rounded-pill mb-3">
        <i className="fa-solid fa-arrow-left me-1" />Volver a la búsqueda
      </button>

      <div className="bugie-card mb-3">
        <div className="bugie-card-body">
          <div className="d-flex flex-wrap align-items-center gap-3">
            <div className="flex-grow-1">
              <div className="fw-bold" style={{ fontSize: '1.1rem' }}>
                {u.fullName ?? 'Sin nombre'}
              </div>
              <div className="small bugie-muted">
                {u.email} {u.phone && `· ${u.phone}`} · {u.role === 'driver' ? 'Conductor' : 'Pasajero'}
              </div>
            </div>

            {p ? (
              <div className="d-flex gap-3 text-center">
                {[
                  ['Disponibles', p.availablePoints],
                  ['Ganados',     p.totalPoints],
                  ['Canjeados',   p.redeemedPoints],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <div className="small bugie-muted">{l}</div>
                    <div className="fw-bold">{fmtPoints(v as number)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="badge rounded-pill"
                    style={{ background: 'var(--bugie-warn)22', color: 'var(--bugie-warn)' }}>
                Nunca ganó puntos
              </span>
            )}
          </div>

          {p && (
            <div className="small bugie-muted mt-3 pt-3"
                 style={{ borderTop: '1px solid var(--bugie-border)' }}>
              Nivel <strong>{p.currentLevel}</strong> ·
              desde {fmtDate(p.memberSince)} ·
              {p.pointsExpiryDate
                ? ` sus puntos vencen el ${fmtDate(p.pointsExpiryDate)}`
                : ' sin fecha de vencimiento'}
              {detail.invited > 0 &&
                ` · invitó a ${detail.invited} (${detail.invitedQualified} activos)`}
            </div>
          )}
        </div>
      </div>

      <AdjustForm userId={u.userId} currentBalance={p?.availablePoints ?? 0} onDone={onReload} />

      <div className="row g-3 mt-0">
        <div className="col-12 col-xl-7">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">Historial de puntos</div>
            <div className="bugie-card-body">
              {detail.history.length === 0 ? (
                <div className="text-center py-4 bugie-muted small">
                  Sin movimientos. Nunca se le acreditó nada.
                </div>
              ) : (
                <div className="d-flex flex-column gap-1" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {detail.history.map(t => {
                    const suma = ['earn', 'bonus', 'adjust_add'].includes(t.type);
                    const esAjuste = t.type.startsWith('adjust');
                    return (
                      <div key={t.id} className="d-flex align-items-center gap-3 py-2"
                           style={{ borderBottom: '1px solid var(--bugie-border)' }}>
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div className="small fw-semibold">
                            {TX_LABEL[t.type] ?? t.type}
                            <span className="fw-normal bugie-muted">
                              {' · '}{SOURCE_LABEL[t.sourceEvent] ?? t.sourceEvent}
                            </span>
                            {esAjuste && (
                              <span className="badge rounded-pill ms-2"
                                    style={{ background: 'var(--bugie-primary-soft)22', color: 'var(--bugie-primary-soft)', fontSize: '.64rem' }}>
                                manual
                              </span>
                            )}
                          </div>
                          <div className="small bugie-muted text-truncate">
                            {fmtDate(t.createdAt, true)}{t.notes && ` — ${t.notes}`}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold" style={{ color: suma ? 'var(--bugie-ok)' : 'var(--bugie-bad)' }}>
                            {suma ? '+' : '−'}{fmtPoints(t.points)}
                          </div>
                          <div className="small bugie-muted">saldo {fmtPoints(t.balanceAfter)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">Canjes y logros</div>
            <div className="bugie-card-body">
              {detail.redemptions.length === 0 && detail.milestones.length === 0 ? (
                <div className="text-center py-4 bugie-muted small">
                  Sin canjes ni logros todavía.
                </div>
              ) : (
                <>
                  {detail.redemptions.map(r => {
                    const color = STATUS_COLOR[r.status] ?? 'var(--bugie-neutral)';
                    return (
                      <div key={r.id} className="d-flex align-items-center gap-2 py-2"
                           style={{ borderBottom: '1px solid var(--bugie-border)' }}>
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div className="small fw-semibold text-truncate">{r.itemName}</div>
                          <div className="small bugie-muted">
                            {r.code} · {describeReward(r)}
                          </div>
                        </div>
                        <span className="badge rounded-pill"
                              style={{ background: color + '22', color, fontSize: '.68rem' }}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </div>
                    );
                  })}

                  {detail.milestones.length > 0 && (
                    <div className="mt-3">
                      <div className="small fw-semibold mb-2">Logros recientes</div>
                      {detail.milestones.map((m, i) => (
                        <div key={i} className="small bugie-muted">· {m}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AdjustForm({ userId, currentBalance, onDone }: {
  userId: string; currentBalance: number; onDone: () => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [done,   setDone]   = useState<string | null>(null);

  const valor   = Number(points);
  const valido  = points.trim() !== '' && !Number.isNaN(valor) && valor !== 0
                  && reason.trim().length >= 5;
  const nuevo   = currentBalance + (Number.isNaN(valor) ? 0 : valor);

  async function aplicar() {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await rewardsAdminApi.adjustPoints(userId, valor, reason.trim());
      setDone(
        `Saldo: ${fmtPoints(r.balanceBefore)} → ${fmtPoints(r.balanceAfter)}.` +
        (r.warning ? ` ${r.warning}` : ''));
      setPoints(''); setReason('');
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo aplicar el ajuste.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="btn btn-sm btn-bugie-outline rounded-pill mb-3">
        <i className="fa-solid fa-pen-to-square me-1" />Ajustar puntos
      </button>
    );
  }

  return (
    <div className="bugie-card mb-3" style={{ border: '1px solid var(--bugie-primary)' }}>
      <div className="bugie-card-header">Ajustar puntos</div>
      <div className="bugie-card-body">
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label small fw-semibold">Puntos</label>
            <input type="number" className="form-control form-control-sm"
                   placeholder="Ej. 500 o -200"
                   value={points} onChange={e => setPoints(e.target.value)} />
            <div className="small bugie-muted mt-1">Positivo suma, negativo resta.</div>
          </div>

          <div className="col-md-9">
            <label className="form-label small fw-semibold">Motivo</label>
            <input className="form-control form-control-sm"
                   placeholder="Ej. compensación por falla del 12/10 que no acreditó puntos"
                   value={reason} onChange={e => setReason(e.target.value)} />
            <div className="small bugie-muted mt-1">
              Obligatorio. Dentro de seis meses nadie va a recordar por qué este
              usuario recibió estos puntos.
            </div>
          </div>
        </div>

        {points.trim() !== '' && !Number.isNaN(valor) && valor !== 0 && (
          <div className="alert alert-info small py-2 mt-3 mb-0">
            El saldo pasaría de <strong>{fmtPoints(currentBalance)}</strong> a{' '}
            <strong>{fmtPoints(Math.max(0, nuevo))}</strong>
            {nuevo < 0 && ' (no puede bajar de cero: se restará solo lo disponible)'}.
          </div>
        )}

        {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}
        {done  && <div className="alert alert-success small mt-3 mb-0">{done}</div>}

        <div className="d-flex gap-2 mt-3">
          <button type="button" className="btn btn-bugie rounded-pill px-4"
                  onClick={aplicar} disabled={!valido || busy}>
            {busy ? <><span className="spinner-border spinner-border-sm me-2" />Aplicando…</>
                  : 'Aplicar ajuste'}
          </button>
          <button type="button" className="btn btn-bugie-outline rounded-pill"
                  onClick={() => { setOpen(false); setError(null); setDone(null); }}
                  disabled={busy}>
            Cerrar
          </button>
        </div>

        <div className="small bugie-muted mt-3">
          El ajuste no borra ni cambia los movimientos anteriores: agrega uno nuevo
          al historial, con tu usuario y el motivo.
        </div>
      </div>
    </div>
  );
}
