import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { rewardsApi, Progress, fmtPoints } from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Racha y meta semanal.

   El punto de una racha no es avisar cuando ya la ganaste, sino que sepas que
   llevas 4 días y te faltan 3. Si solo te enteras al cobrar el bono, la racha
   no motiva a nadie a viajar mañana.

   Por eso la tira de días es lo primero: se lee de un vistazo cuántos llevas y
   cuántos faltan.
   ────────────────────────────────────────────────────────────────────────── */

/* Dos letras y no una: con una sola, lunes y martes son ambos «L/M» y
   miércoles también «M». Nadie distingue M de M en una fila. */
const DIA_CORTO = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

export default function RewardsProgress() {
  const [data,    setData]    = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    rewardsApi.progress()
      .then(setData)
      .catch(e => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu progreso.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bugie-card mb-3">
        <div className="bugie-card-body d-flex justify-content-center py-4">
          <span className="spinner-border spinner-border-sm" />
        </div>
      </div>
    );
  }

  // Si falla, no se muestra nada: es información complementaria y no vale la
  // pena ensuciar la pantalla principal con un error por esto.
  if (error || !data) return null;

  const rachaActiva = data.streakTarget > 0;
  const metaActiva  = data.weeklyGoal > 0;
  if (!rachaActiva && !metaActiva && !data.isAnniversaryMonth) return null;

  return (
    <div className="row g-3 mb-3">
      {rachaActiva && (
        <div className={metaActiva ? 'col-12 col-lg-7' : 'col-12'}>
          <StreakCard data={data} />
        </div>
      )}

      {metaActiva && (
        <div className={rachaActiva ? 'col-12 col-lg-5' : 'col-12'}>
          <WeeklyCard data={data} />
        </div>
      )}

      {data.isAnniversaryMonth && (
        <div className="col-12">
          <div className="alert alert-warning d-flex align-items-center gap-2 mb-0">
            <i className="fa-solid fa-cake-candles" />
            <div className="small">
              <strong>Es tu mes de aniversario en Bugie.</strong>{' '}
              Ganas {data.anniversaryMultiplier}x puntos en todos tus viajes hasta fin de mes.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StreakCard({ data }: { data: Progress }) {
  const hoyCuenta = data.traveledToday;

  // Mensaje según el momento: es lo que convierte el dato en una invitación.
  const mensaje = !hoyCuenta && data.streakDays === 0
    ? 'Viaja hoy para empezar una racha.'
    : data.streakDaysToGo === 0
    ? `¡Completaste ${data.streakDays} días! Ya ganaste ${fmtPoints(data.streakPoints)} puntos.`
    : `Viaja ${data.streakDaysToGo} ${data.streakDaysToGo === 1 ? 'día' : 'días'} más y ganas ${fmtPoints(data.streakPoints)} puntos.`;

  return (
    <div className="bugie-card h-100">
      <div className="bugie-card-body">
        <div className="d-flex align-items-center gap-2 mb-3">
          <i className="fa-solid fa-fire" style={{ color: hoyCuenta ? '#f97316' : 'var(--bugie-muted)' }} />
          <span className="fw-semibold">Tu racha</span>
          <span className="ms-auto fw-bold" style={{ fontSize: '1.3rem' }}>
            {data.streakDays}
            <span className="fw-normal bugie-muted small"> / {data.streakTarget} días</span>
          </span>
        </div>

        {/* La tira de dias.

            Antes eran rectangulos anchos con un punto dentro: parecian campos
            vacios de un formulario y no se entendia que representaban.

            Ahora son circulos de tamano fijo unidos por una linea, que es como
            se lee una secuencia. El dia cumplido se llena y lleva un check; el
            que falta queda hueco. Debajo va el dia de la semana, y el de hoy
            dice «Hoy» en lugar de depender de un borde que casi no se nota. */}
        <div className="position-relative mb-3" style={{ paddingBottom: 4 }}>
          {/* La linea que une los circulos, detras de ellos. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', left: 18, right: 18, top: 17, height: 2,
              background: 'var(--bugie-border)', zIndex: 0,
            }}
          />

          <div className="d-flex justify-content-between position-relative"
               style={{ zIndex: 1 }}>
            {data.days.map((d, i) => {
              const fecha = new Date(d.date);
              const dia   = DIA_CORTO[fecha.getDay()];
              return (
                <div key={i} className="text-center"
                     title={`${dia} ${fecha.getDate()}`}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      margin: '0 auto',
                      background: d.hasTrip ? '#f97316' : 'var(--bugie-surface)',
                      border: d.hasTrip
                        ? '2px solid #f97316'
                        : `2px solid ${d.isToday ? 'var(--bugie-primary)' : 'var(--bugie-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: d.hasTrip ? '#fff' : 'var(--bugie-muted)',
                      fontSize: '.78rem', fontWeight: 700,
                    }}
                  >
                    {d.hasTrip
                      ? <i className="fa-solid fa-check" style={{ fontSize: '.8rem' }} />
                      : fecha.getDate()}
                  </div>
                  <div
                    className="mt-1"
                    style={{
                      fontSize: '.68rem',
                      fontWeight: d.isToday ? 700 : 400,
                      color: d.isToday ? 'var(--bugie-primary)' : 'var(--bugie-muted)',
                    }}
                  >
                    {d.isToday ? 'Hoy' : dia}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="small">{mensaje}</div>

        {!hoyCuenta && data.streakDays === 0 && (
          <div className="small bugie-muted mt-1">
            La racha se corta si pasas un día sin viajar.
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyCard({ data }: { data: Progress }) {
  const pct     = Math.min(100, Math.round(data.weeklyTrips / data.weeklyGoal * 100));
  const faltan  = Math.max(0, data.weeklyGoal - data.weeklyTrips);
  const lograda = faltan === 0;

  return (
    <div className="bugie-card h-100">
      <div className="bugie-card-body">
        <div className="d-flex align-items-center gap-2 mb-3">
          <i className="fa-solid fa-bullseye" style={{ color: lograda ? '#34d399' : 'var(--bugie-primary)' }} />
          <span className="fw-semibold">Meta de la semana</span>
          <span className="ms-auto fw-bold" style={{ fontSize: '1.3rem' }}>
            {data.weeklyTrips}
            <span className="fw-normal bugie-muted small"> / {data.weeklyGoal}</span>
          </span>
        </div>

        <div className="progress mb-2" style={{ height: 10 }}
             role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{
            width: `${pct}%`,
            background: lograda ? '#34d399' : undefined,
          }} />
        </div>

        <div className="small">
          {lograda
            ? `Meta cumplida. Ganaste ${fmtPoints(data.weeklyPoints)} puntos.`
            : `Te faltan ${faltan} ${faltan === 1 ? 'viaje' : 'viajes'} para ganar ${fmtPoints(data.weeklyPoints)} puntos.`}
        </div>

        <div className="small bugie-muted mt-1">
          La semana se reinicia el lunes.
        </div>
      </div>
    </div>
  );
}
