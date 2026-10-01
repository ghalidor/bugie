import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import RewardsProgress from './RewardsProgress';
import {
  rewardsApi, PointsProfile, PointsTransaction, RewardLevel,
  TX_LABEL, SOURCE_LABEL, LEVEL_COLOR, fmtPoints, fmtDate, daysUntil,
} from '../../state/rewards';

const PAGE_SIZE = 10;

export default function RewardsSummary({ onGoToCatalog }: { onGoToCatalog: () => void }) {
  const [profile, setProfile] = useState<PointsProfile | null>(null);
  const [levels,  setLevels]  = useState<RewardLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([rewardsApi.me(), rewardsApi.levels()])
      .then(([p, l]) => { setProfile(p); setLevels(l); })
      .catch(err => setError(err instanceof ApiError
        ? err.message
        : 'No se pudo conectar con el servicio de puntos.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (error || !profile) {
    return <div className="alert alert-danger small">{error ?? 'No se encontró tu perfil de puntos.'}</div>;
  }

  const color = LEVEL_COLOR[profile.currentLevel] ?? '#94a3b8';

  return (
    <>
      {/* Racha y meta semanal: lo que falta, antes de lo ya conseguido. */}
      <RewardsProgress />

      {/* Nivel y progreso: el elemento principal de la pantalla */}
      <div className="bugie-card mb-3" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="bugie-card-body">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <div className="small bugie-muted mb-1">Tu nivel</div>
              <div className="d-flex align-items-center gap-2">
                <i className="fa-solid fa-medal" style={{ color, fontSize: '1.6rem' }} />
                <span className="fw-bold" style={{ fontSize: '1.8rem', letterSpacing: '-.03em' }}>
                  {profile.currentLevelName}
                </span>
              </div>
              {profile.discountPercentage > 0 && (
                <div className="small mt-1">
                  Beneficio de nivel: {profile.discountPercentage}% de descuento
                </div>
              )}
            </div>

            <div className="text-end">
              <div className="small bugie-muted mb-1">Puntos disponibles</div>
              <div className="fw-bold" style={{ fontSize: '2.2rem', lineHeight: 1 }}>
                {fmtPoints(profile.availablePoints)}
              </div>
            </div>
          </div>

          {profile.nextLevelName ? (
            <>
              <div className="progress mb-2" style={{ height: 10 }} role="progressbar"
                   aria-valuenow={profile.progressPercentage} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-bar" style={{ width: `${profile.progressPercentage}%`, background: color }} />
              </div>
              <div className="small bugie-muted">
                Te faltan <strong>{fmtPoints(profile.pointsToNextLevel)}</strong> puntos
                para llegar a <strong>{profile.nextLevelName}</strong>.
              </div>
            </>
          ) : (
            <div className="small bugie-muted">Estás en el nivel más alto.</div>
          )}
        </div>
      </div>

      <ExpiryNotice profile={profile} />

      {/* Totales */}
      <div className="row g-3 mb-3">
        {[
          ['Disponibles',     fmtPoints(profile.availablePoints)],
          ['Ganados en total', fmtPoints(profile.totalPoints)],
          ['Canjeados',       fmtPoints(profile.redeemedPoints)],
        ].map(([label, value]) => (
          <div className="col-md-4" key={label}>
            <div className="bugie-kpi">
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <History />
        </div>
        <div className="col-12 col-lg-5">
          <LevelLadder levels={levels} current={profile.currentLevel} />
          {profile.availablePoints > 0 && (
            <button type="button" onClick={onGoToCatalog} className="btn btn-bugie rounded-pill w-100 mt-3">
              <i className="fa-solid fa-gift me-2" />
              Ver recompensas
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/// Aviso de vencimiento. Se pone en ambar cuando faltan 30 dias o menos,
/// que es la misma anticipacion con la que el sistema manda el push.
function ExpiryNotice({ profile }: { profile: PointsProfile }) {
  if (profile.availablePoints <= 0 || !profile.pointsExpiryDate) return null;

  const days = daysUntil(profile.pointsExpiryDate) ?? 0;
  const soon = days <= 30;

  return (
    <div className={`alert small mb-3 ${soon ? 'alert-warning' : 'alert-info'}`}>
      <i className={`fa-solid ${soon ? 'fa-hourglass-half' : 'fa-circle-info'} me-2`} />
      Tus {fmtPoints(profile.availablePoints)} puntos vencen el{' '}
      <strong>{fmtDate(profile.pointsExpiryDate)}</strong>
      {days > 0 && ` (en ${days} día${days === 1 ? '' : 's'})`}.
      {' '}Cada viaje que completas renueva la vigencia de todo tu saldo.
    </div>
  );
}

function LevelLadder({ levels, current }: { levels: RewardLevel[]; current: string }) {
  const active = levels.filter(l => l.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  if (active.length === 0) return null;

  return (
    <div className="bugie-card">
      <div className="bugie-card-header">Niveles</div>
      <div className="bugie-card-body d-grid gap-2">
        {active.map(l => {
          const isCurrent = l.name === current;
          const color = LEVEL_COLOR[l.name] ?? '#94a3b8';
          const perks: string[] = [];
          if (l.discountPercentage > 0)   perks.push(`${l.discountPercentage}% de descuento`);
          if (l.monthlyFreeTrips > 0)     perks.push(`${l.monthlyFreeTrips} viaje${l.monthlyFreeTrips === 1 ? '' : 's'} gratis al mes`);
          if (l.monthlyRaffleTickets > 0) perks.push(`${l.monthlyRaffleTickets} ticket${l.monthlyRaffleTickets === 1 ? '' : 's'} en el sorteo mensual`);

          return (
            <div key={l.id} className="p-2" style={{
              borderRadius: 10,
              background: isCurrent ? `${color}1f` : 'transparent',
              border: `1px solid ${isCurrent ? color : 'var(--bugie-border)'}`,
            }}>
              <div className="d-flex align-items-center gap-2">
                <i className="fa-solid fa-medal" style={{ color }} />
                <span className="fw-semibold">{l.displayName}</span>
                {isCurrent && <span className="bugie-chip ms-1">Tu nivel</span>}
                <span className="ms-auto small bugie-muted">
                  desde {fmtPoints(l.minPoints)} pts
                </span>
              </div>
              {perks.length > 0 && <div className="small bugie-muted mt-1">{perks.join(', ')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function History() {
  const [items,   setItems]   = useState<PointsTransaction[]>([]);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [first,   setFirst]   = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load(reset: boolean) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const p = reset ? 1 : page;
      const data = await rewardsApi.history(p, PAGE_SIZE);
      setItems(prev => reset ? data.items : [...prev, ...data.items]);
      setPage(p + 1);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
      setFirst(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bugie-card">
      <div className="bugie-card-header">Movimientos</div>
      <div className="bugie-card-body">
        {error && <div className="alert alert-danger small">{error}</div>}

        {first ? (
          <div className="d-flex justify-content-center py-3"><span className="spinner-border spinner-border-sm" /></div>
        ) : error && items.length === 0 ? null : items.length === 0 ? (
          <div className="text-center py-3 bugie-muted small">
            Todavía no tienes movimientos. Completa un viaje para empezar a acumular puntos.
          </div>
        ) : (
          <div className="d-grid gap-2">
            {items.map(t => {
              const positive = t.type === 'earn' || t.type === 'bonus';
              return (
                <div key={t.id} className="d-flex align-items-center gap-3 py-1"
                     style={{ borderBottom: '1px solid var(--bugie-border)' }}>
                  <div className="flex-grow-1">
                    <div className="fw-semibold small">
                      {TX_LABEL[t.type] ?? t.type}
                      <span className="fw-normal bugie-muted"> · {SOURCE_LABEL[t.sourceEvent] ?? t.sourceEvent}</span>
                    </div>
                    <div className="small bugie-muted">
                      {fmtDate(t.createdAt, true)}
                      {t.notes && ` — ${t.notes}`}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold" style={{ color: positive ? '#34d399' : '#ef4444' }}>
                      {positive ? '+' : '−'}{fmtPoints(t.points)}
                    </div>
                    <div className="small bugie-muted">saldo {fmtPoints(t.balanceAfter)}</div>
                  </div>
                </div>
              );
            })}

            {items.length < total && (
              <button type="button" onClick={() => load(false)} disabled={loading}
                      className="btn btn-bugie-outline rounded-pill mt-2">
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2" />Cargando...</>
                  : `Cargar más (${items.length} de ${total})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
