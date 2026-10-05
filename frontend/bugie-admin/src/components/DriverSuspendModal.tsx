import { useState } from 'react';
import { Field, Modal } from './ui';

/// Suspender a un conductor aprobado: motivo obligatorio (10-500) y duración.
/// `until` = ÚLTIMO día de suspensión (yyyy-MM-dd, hora de Perú) o null = indefinida.
/// La confirmación final la pide el padre en `onSubmit`.

const MIN = 10;
const MAX = 500;
const MAX_DAYS = 365;

type Duration = '3' | '7' | '15' | '30' | 'indef' | 'date';
const OPTIONS: { value: Duration; label: string }[] = [
  { value: '3',     label: '3 días' },
  { value: '7',     label: '7 días' },
  { value: '15',    label: '15 días' },
  { value: '30',    label: '30 días' },
  { value: 'indef', label: 'Indefinida' },
  { value: 'date',  label: 'Hasta una fecha' },
];

/// Hoy en Perú como yyyy-MM-dd (sin depender de la zona del navegador).
export function todayPeru(): string {
  // en-CA formatea como yyyy-MM-dd
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/// Suma días a una fecha yyyy-MM-dd.
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/// yyyy-MM-dd → dd/MM/yyyy
export const ymdToDisplay = (ymd: string) => ymd.split('-').reverse().join('/');

export interface SuspendData { reason: string; until: string | null; }

export default function DriverSuspendModal({ driverName, submitting, error, onSubmit, onClose }: {
  driverName: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (data: SuspendData) => void;
  onClose: () => void;
}) {
  const today = todayPeru();
  const minDate = addDays(today, 1);
  const maxDate = addDays(today, MAX_DAYS);

  const [reason, setReason]     = useState('');
  const [duration, setDuration] = useState<Duration>('7');
  const [date, setDate]         = useState('');

  const len = reason.trim().length;
  const reasonError = len > 0 && len < MIN ? `Mínimo ${MIN} caracteres.` : len > MAX ? `Máximo ${MAX} caracteres.` : null;

  let until: string | null = null;
  let dateError: string | null = null;
  if (duration === 'indef') until = null;
  else if (duration === 'date') {
    if (!date) dateError = 'Elige el último día de la suspensión.';
    else if (date < minDate) dateError = 'La fecha debe ser posterior a hoy.';
    else if (date > maxDate) dateError = `La fecha no puede pasar de ${ymdToDisplay(maxDate)} (máx. ${MAX_DAYS} días).`;
    else until = date;
  } else until = addDays(today, Number(duration));

  const canSubmit = !submitting && len >= MIN && len <= MAX && !dateError;
  const summary = duration === 'indef'
    ? 'Suspensión indefinida: tendrás que reactivarlo manualmente.'
    : until ? `Podrá volver a trabajar desde el ${ymdToDisplay(addDays(until, 1))} (suspendido hasta el ${ymdToDisplay(until)}, inclusive).` : null;

  return (
    <Modal
      open
      onClose={onClose}
      busy={submitting}
      dirty="auto"
      title={<><i className="fa-solid fa-ban me-2" style={{ color: 'var(--bugie-bad)' }} aria-hidden="true" />Suspender conductor</>}
      description={`${driverName} no podrá conectarse ni recibir viajes mientras dure la suspensión.`}
      footer={
        <div className="d-flex flex-wrap justify-content-end gap-2 w-100">
          <button className="btn btn-outline-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn btn-danger" disabled={!canSubmit} onClick={() => onSubmit({ reason: reason.trim(), until })}>
            {submitting
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Suspendiendo…</>
              : <><i className="fa-solid fa-ban me-2" aria-hidden="true" />Suspender</>}
          </button>
        </div>
      }
    >
      <div className="d-grid gap-3">
        <Field label="Duración" required>
          <div className="d-flex flex-wrap gap-2" role="radiogroup" aria-label="Duración de la suspensión">
            {OPTIONS.map(o => (
              <button key={o.value} type="button" role="radio" aria-checked={duration === o.value}
                      className={`btn btn-sm ${duration === o.value ? 'btn-bugie' : 'btn-outline-secondary'}`}
                      disabled={submitting} onClick={() => setDuration(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        {duration === 'date' && (
          <Field label="Último día de suspensión" required error={date ? dateError ?? undefined : undefined}
                 help={`Entre ${ymdToDisplay(minDate)} y ${ymdToDisplay(maxDate)}.`}>
            <input type="date" className="form-control" min={minDate} max={maxDate} value={date}
                   onChange={e => setDate(e.target.value)} disabled={submitting} />
          </Field>
        )}

        {summary && (
          <div className="alert alert-warning small mb-0 d-flex gap-2 align-items-start">
            <i className="fa-solid fa-calendar-day mt-1" aria-hidden="true" />
            <div>{summary}</div>
          </div>
        )}

        <Field label="Motivo de la suspensión" required error={reasonError ?? undefined}
               help="El conductor lo verá en la app y en el correo. Queda en el historial.">
          <textarea className="form-control" rows={4} maxLength={MAX} value={reason}
                    onChange={e => setReason(e.target.value)} disabled={submitting}
                    placeholder="Ej.: Reclamos repetidos de pasajeros por conducción peligrosa." />
        </Field>
        <div className={`small text-end ${len > 0 && len < MIN ? 'text-danger' : 'bugie-muted'}`} style={{ marginTop: -8 }}>
          {len}/{MAX} {len < MIN && `(mínimo ${MIN})`}
        </div>

        {error && <div className="alert alert-danger small mb-0">{error}</div>}
      </div>
    </Modal>
  );
}
