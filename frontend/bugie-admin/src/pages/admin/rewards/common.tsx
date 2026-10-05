import { ReactNode } from 'react';
import { ApiError } from '../../../state/api';
import { EmptyState } from '../../../components/ui';
import './rewards.css';

/** Mensaje de error legible: el del backend si lo hay, o el texto por defecto. */
export const errMsg = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e.message : fallback;

/** Estado de error con botón "Reintentar". */
export function LoadError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <EmptyState
      compact
      variant="error"
      title="No se pudo cargar"
      text={text}
      action={onRetry && (
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onRetry}>
          <i className="fa-solid fa-rotate-right me-1" aria-hidden="true" />Reintentar
        </button>
      )}
    />
  );
}

/** Título de bloque dentro de un formulario (Drawer). */
export function FormSection({ step, title, help, children }: {
  step?: number; title: string; help?: string; children: ReactNode;
}) {
  return (
    <section className="rw-form-section">
      <h3 className="rw-form-section-title">
        {step !== undefined && <span className="rw-step" aria-hidden="true">{step}</span>}
        {title}
      </h3>
      {help && <p className="rw-form-section-help">{help}</p>}
      <div className="bx-form-grid">{children}</div>
    </section>
  );
}

/** Convierte el texto de un input numérico opcional en número o null. */
export const optNum = (v: string) => (v.trim() === '' ? null : Number(v));

export const soles = (n: number | null | undefined) => `S/ ${(n ?? 0).toFixed(2)}`;

export const USER_TYPE_CHIPS = [
  { value: 'passenger', label: 'Pasajeros' },
  { value: 'driver',    label: 'Conductores' },
];
