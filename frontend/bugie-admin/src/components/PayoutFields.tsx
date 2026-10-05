import { PAYOUT_METHOD, PayoutMethod } from '../state/payouts';
import { Field, FormGrid, Select } from './ui';

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
export default function PayoutFields({ value, onChange, amountLocked = false, amountMax, noteLabel, noteRequired = false }: {
  value: PayoutDraft;
  onChange: (v: PayoutDraft) => void;
  /** El monto lo fija otra cosa (p. ej. el código de cobro): se muestra sin poder editarlo. */
  amountLocked?: boolean;
  /** Tope del monto (p. ej. la deuda actual). */
  amountMax?: number;
  /** Texto de la nota (por defecto "Nota (opcional)"). */
  noteLabel?: string;
  noteRequired?: boolean;
}) {
  const set = <K extends keyof PayoutDraft>(k: K, v: PayoutDraft[K]) => onChange({ ...value, [k]: v });

  return (
    <FormGrid>
      <Field label="Método">
        <Select
          value={value.method}
          onChange={m => set('method', m)}
          options={(Object.keys(PAYOUT_METHOD) as PayoutMethod[]).map(m => ({ value: m, label: PAYOUT_METHOD[m].label, icon: PAYOUT_METHOD[m].icon }))}
        />
      </Field>
      <Field label="N.º de operación" optional={value.method === 'efectivo'}>
        <input className="form-control" value={value.operationNumber}
               placeholder={value.method === 'efectivo' ? 'Opcional' : 'Ej: 88213'}
               onChange={e => set('operationNumber', e.target.value)} maxLength={50} />
      </Field>
      <Field label="Monto (S/)">
        <input className="form-control" type="number" min="0.01" step="0.01" max={amountMax}
               value={value.amount} onChange={e => set('amount', e.target.value)}
               readOnly={amountLocked} aria-readonly={amountLocked || undefined} />
      </Field>
      <Field label="Fecha y hora del pago">
        <input className="form-control" type="datetime-local"
               value={value.paidAt} onChange={e => set('paidAt', e.target.value)} />
      </Field>
      <Field label={noteLabel ?? 'Nota'} required={noteRequired} optional={!noteRequired && !noteLabel} span="full">
        <input className="form-control" value={value.note} maxLength={300}
               placeholder={noteRequired ? 'Ej: bono por conductor del mes' : 'Ej: pagado al número 952...'}
               onChange={e => set('note', e.target.value)} />
      </Field>
    </FormGrid>
  );
}
