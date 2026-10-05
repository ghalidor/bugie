import { useState } from 'react';
import { Field, Modal } from './ui';

/// Modal de aprobación por excepción: el conductor NO tiene todos sus
/// documentos completos. El admin solo puede aprobar escribiendo un motivo
/// (queda en la auditoría) y el conductor tendrá 3 días para completar.
export default function DriverApprovalModal({ missingLabels, submitting, error, onConfirm, onClose }: {
  missingLabels: string[];
  submitting: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0 && !submitting;

  return (
    <Modal
      open
      onClose={onClose}
      busy={submitting}
      dirty="auto"
      title={<><i className="fa-solid fa-triangle-exclamation me-2" style={{ color: 'var(--bugie-warn)' }} aria-hidden="true" />Aprobar por excepción</>}
      description="Este conductor todavía no tiene todos sus documentos obligatorios aprobados."
      footer={
        <div className="d-flex flex-wrap justify-content-end gap-2 w-100">
          <button className="btn btn-outline-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn btn-warning" disabled={!canSubmit} onClick={() => onConfirm(reason.trim())}>
            {submitting
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Aprobando…</>
              : <><i className="fa-solid fa-circle-check me-2" aria-hidden="true" />Aprobar con plazo de 3 días</>}
          </button>
        </div>
      }
    >
      <div className="small mb-2">Faltan:</div>
      <ul className="small mb-3">
        {missingLabels.map(l => <li key={l} className="fw-bold">{l}</li>)}
      </ul>

      <div className="alert alert-warning small d-flex gap-2 align-items-start">
        <i className="fa-solid fa-clock mt-1" aria-hidden="true" />
        <div>
          El conductor quedará <strong>aprobado</strong>, pero tendrá <strong>3 días</strong> para
          completar sus documentos. Si no los completa, se desactivará automáticamente y se le
          registrará una falta (con una falta ya no podrá aprobarse por excepción).
        </div>
      </div>

      <Field label="Motivo de la excepción" required help="Queda registrado en la auditoría con tu nombre y la fecha.">
        <textarea
          className="form-control"
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej.: Presentó el SOAT físico en oficina, falta subir la foto."
          disabled={submitting}
        />
      </Field>

      {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}
    </Modal>
  );
}
