import { createContext, ReactNode, useCallback, useContext, useEffect, useId, useState } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  /** Explica que va a pasar. */
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 'danger' pinta el boton en rojo. Por defecto 'primary'. */
  tone?: 'primary' | 'danger' | 'warning';
  /** Pide un motivo: 'optional' u 'required'. Sin esto no se muestra el campo. */
  reason?: 'optional' | 'required';
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Valor inicial del campo motivo (sirve como reemplazo de prompt()). */
  reasonDefault?: string;
  /** Acciones irreversibles: el usuario debe escribir esta palabra para habilitar el boton. */
  typeToConfirm?: string;
}

/** null = canceló. Si confirmó, trae el motivo escrito (o ''). */
export type ConfirmResult = { reason: string } | null;

type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface Pending { opts: ConfirmOptions; resolve: (r: ConfirmResult) => void }

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  /** Muestra spinner en el boton confirmar. */
  busy?: boolean;
}

/** Dialogo de confirmacion controlado. Normalmente usaras el hook useConfirm(). */
export function ConfirmDialog({ open, onConfirm, onCancel, busy, title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', tone = 'primary', reason, reasonLabel = 'Motivo', reasonPlaceholder = 'Escribe el motivo…', reasonDefault = '', typeToConfirm }: ConfirmDialogProps) {
  const [text, setText] = useState(reasonDefault);
  const [typed, setTyped] = useState('');
  const reasonId = useId();
  const typeId = useId();
  // Reinicia los campos cada vez que se abre.
  useEffect(() => {
    if (open) { setText(reasonDefault); setTyped(''); }
  }, [open, reasonDefault]);

  const reasonOk = reason !== 'required' || text.trim().length > 0;
  const typedOk = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  const canConfirm = reasonOk && typedOk && !busy;
  const toneCls = tone === 'danger' ? 'bx-tone-bad' : tone === 'warning' ? 'bx-tone-warn' : 'bx-tone-primary';
  const icon = tone === 'danger' ? 'fa-triangle-exclamation' : tone === 'warning' ? 'fa-circle-exclamation' : 'fa-circle-question';
  const btnCls = tone === 'danger' ? 'btn-danger' : 'btn-bugie';

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onCancel(); }}
      size="sm"
      hideClose
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>{cancelText}</button>
          <button
            type="button"
            className={`btn ${btnCls}`}
            disabled={!canConfirm}
            data-autofocus={!reason && !typeToConfirm ? true : undefined}
            onClick={() => onConfirm(text.trim())}
          >
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            {confirmText}
          </button>
        </>
      }
    >
      <form
        className="d-flex gap-3"
        onSubmit={e => { e.preventDefault(); if (canConfirm) onConfirm(text.trim()); }}
      >
        <span className={`bx-confirm-icon ${toneCls}`} aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <div className="flex-grow-1 d-grid gap-3" style={{ minWidth: 0 }}>
          <div>
            <h2 className="bx-dialog-title">{title}</h2>
            {message && <div className="bugie-muted small mt-1">{message}</div>}
          </div>
          {reason && (
            <div className="bx-field">
              <label htmlFor={reasonId} className="bx-field-label">
                {reasonLabel}
                {reason === 'required' ? <span className="bx-field-req" aria-hidden="true">*</span> : <span className="bx-field-opt">(opcional)</span>}
              </label>
              <textarea
                id={reasonId}
                className="form-control"
                rows={3}
                value={text}
                placeholder={reasonPlaceholder}
                required={reason === 'required'}
                onChange={e => setText(e.target.value)}
              />
            </div>
          )}
          {typeToConfirm && (
            <div className="bx-field">
              <label htmlFor={typeId} className="bx-field-label">
                Esta acción no se puede deshacer. Escribe <span className="bx-confirm-word">{typeToConfirm}</span> para continuar.
              </label>
              <input id={typeId} className="form-control" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} />
            </div>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </div>
      </form>
    </Modal>
  );
}

/** Monta una vez en la raiz. Habilita useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  const confirm = useCallback<ConfirmFn>(opts => new Promise<ConfirmResult>(resolve => {
    setPending({ opts, resolve });
    setOpen(true);
  }), []);

  const finish = (r: ConfirmResult) => {
    pending?.resolve(r);
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          {...pending.opts}
          open={open}
          onConfirm={reason => finish({ reason })}
          onCancel={() => finish(null)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Reemplaza confirm() y prompt():
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: '¿Aprobar conductor?' });
 *   if (!ok) return;
 *   const r = await confirm({ title: 'Rechazar', tone: 'danger', reason: 'required' });
 *   if (r) enviar(r.reason);
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() necesita <ConfirmProvider> en la raíz.');
  return ctx;
}
