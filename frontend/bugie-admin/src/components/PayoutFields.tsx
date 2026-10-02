import { PAYOUT_METHOD, PayoutMethod } from '../state/payouts';

/** Datos del pago que llena el admin. */
export interface PayoutDraft {
  method:          PayoutMethod;
  operationNumber: string;
  amount:          string;
  paidAt:          string;   // datetime-local, hora de Peru
  note:            string;
}

/** Devuelve el error a mostrar, o null si el pago se puede registrar. */
export function validatePayout(d: PayoutDraft): string | null {
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Ingresa el monto pagado.';
  if (d.method !== 'efectivo' && !d.operationNumber.trim()) return 'Ingresa el número de operación.';
  if (!d.paidAt) return 'Ingresa la fecha del pago.';
  return null;
}

/** Campos del formulario de pago (método, n. de operación, monto, fecha, nota). */
export default function PayoutFields({ value, onChange }: {
  value: PayoutDraft;
  onChange: (v: PayoutDraft) => void;
}) {
  const set = <K extends keyof PayoutDraft>(k: K, v: PayoutDraft[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="row g-2">
      <div className="col-sm-4">
        <label className="form-label small mb-1">Método</label>
        <select className="form-select form-select-sm" value={value.method}
                onChange={e => set('method', e.target.value as PayoutMethod)}>
          {(Object.keys(PAYOUT_METHOD) as PayoutMethod[]).map(m => (
            <option key={m} value={m}>{PAYOUT_METHOD[m].label}</option>
          ))}
        </select>
      </div>
      <div className="col-sm-4">
        <label className="form-label small mb-1">
          N.º de operación{value.method === 'efectivo' ? ' (opcional)' : ''}
        </label>
        <input className="form-control form-control-sm" value={value.operationNumber}
               placeholder={value.method === 'efectivo' ? 'Opcional' : 'Ej: 88213'}
               onChange={e => set('operationNumber', e.target.value)} maxLength={50} />
      </div>
      <div className="col-sm-4">
        <label className="form-label small mb-1">Monto (S/)</label>
        <input className="form-control form-control-sm" type="number" min="0.01" step="0.01"
               value={value.amount} onChange={e => set('amount', e.target.value)} />
      </div>
      <div className="col-sm-5">
        <label className="form-label small mb-1">Fecha y hora del pago</label>
        <input className="form-control form-control-sm" type="datetime-local"
               value={value.paidAt} onChange={e => set('paidAt', e.target.value)} />
      </div>
      <div className="col-sm-7">
        <label className="form-label small mb-1">Nota (opcional)</label>
        <input className="form-control form-control-sm" value={value.note} maxLength={300}
               placeholder="Ej: pagado al número 952..." onChange={e => set('note', e.target.value)} />
      </div>
    </div>
  );
}
