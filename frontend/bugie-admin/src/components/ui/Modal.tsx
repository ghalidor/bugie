import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap, useLayer, usePresence, useScrollLock } from './hooks';

export type OverlaySize = 'sm' | 'md' | 'lg' | 'xl';

interface BaseProps {
  /** Si se muestra. */
  open: boolean;
  /** Se llama con la X, Esc o clic fuera (si no hay cambios sin guardar ni envio en curso). */
  onClose: () => void;
  title?: ReactNode;
  /** Una linea bajo el titulo. */
  description?: ReactNode;
  children?: ReactNode;
  /** Botones del pie (alineados a la derecha). */
  footer?: ReactNode;
  size?: OverlaySize;
  /**
   * Cambios sin guardar. Si hay cambios, cerrar (X, Esc o clic fuera) pide confirmacion.
   * 'auto' = se marca solo cuando el usuario escribe o cambia algun campo del panel.
   */
  dirty?: boolean | 'auto';
  /** Hay un envio en curso: cerrar pide confirmacion. */
  busy?: boolean;
  /** false = el clic fuera no hace nada. Por defecto true. Evitalo: usa `dirty`. */
  closeOnBackdrop?: boolean;
  /** Oculta la X de cerrar (solo para dialogos de confirmacion). */
  hideClose?: boolean;
  className?: string;
}

type Ask = null | 'dirty' | 'busy';

function Overlay({ kind, open, onClose, title, description, children, footer, size = 'md', dirty, busy, closeOnBackdrop = true, hideClose, className = '' }: BaseProps & { kind: 'modal' | 'drawer' }) {
  const { mounted, closing } = usePresence(open, 200);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const active = mounted && !closing;

  // Deteccion automatica de cambios: cualquier input/change dentro del panel.
  const touched = useRef(false);
  const [ask, setAsk] = useState<Ask>(null);
  // Mantiene el texto mientras la confirmacion se anima al cerrar.
  const lastAsk = useRef<Ask>(null);
  if (ask) lastAsk.current = ask;
  const shown = ask ?? lastAsk.current;
  useEffect(() => {
    if (open) { touched.current = false; setAsk(null); }
  }, [open]);
  useEffect(() => {
    const node = panelRef.current;
    if (!active || dirty !== 'auto' || !node) return;
    const mark = () => { touched.current = true; };
    node.addEventListener('input', mark);
    node.addEventListener('change', mark);
    return () => {
      node.removeEventListener('input', mark);
      node.removeEventListener('change', mark);
    };
  }, [active, dirty]);

  /** Intento de cierre del usuario (X, Esc, clic fuera). */
  function requestClose() {
    if (busy) { setAsk('busy'); return; }
    if (dirty === true || (dirty === 'auto' && touched.current)) { setAsk('dirty'); return; }
    onClose();
  }

  useLayer(active, requestClose);
  useScrollLock(mounted);
  useFocusTrap(panelRef, active);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`bx-overlay ${kind === 'modal' ? 'modal-pos' : 'drawer-pos'} ${closing ? 'is-closing' : ''}`}
      onMouseDown={e => { if (closeOnBackdrop && e.target === e.currentTarget) requestClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`bx-dialog ${kind === 'modal' ? 'bx-modal' : 'bx-drawer'} bx-size-${size} ${className}`}
      >
        {title ? (
          <div className="bx-dialog-head">
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <h2 id={titleId} className="bx-dialog-title">{title}</h2>
              {description && <p id={descId} className="bx-dialog-desc">{description}</p>}
            </div>
            {!hideClose && (
              <button type="button" className="bx-icon-btn sm ghost" onClick={requestClose} aria-label="Cerrar">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : !hideClose && (
          // Sin titulo (avisos con ilustracion): la X flota arriba a la derecha.
          <button type="button" className="bx-icon-btn sm ghost bx-dialog-x" onClick={requestClose} aria-label="Cerrar">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}

        <div className="bx-dialog-body">{children}</div>
        {footer && <div className="bx-dialog-foot">{footer}</div>}
      </div>

      {/* Confirmacion para descartar cambios o cerrar durante un envio */}
      <Overlay
        kind="modal"
        size="sm"
        open={ask !== null}
        onClose={() => setAsk(null)}
        hideClose
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" data-autofocus onClick={() => setAsk(null)}>
              {shown === 'busy' ? 'Esperar' : 'Seguir editando'}
            </button>
            <button type="button" className="btn btn-bugie" onClick={() => { setAsk(null); onClose(); }}>
              {shown === 'busy' ? 'Cerrar igual' : 'Descartar'}
            </button>
          </>
        }
      >
        <div className="d-flex gap-3">
          <span className="bx-confirm-icon bx-tone-warn" aria-hidden="true"><i className="fa-solid fa-circle-exclamation" /></span>
          <div style={{ minWidth: 0 }}>
            <h2 className="bx-dialog-title">{shown === 'busy' ? 'Se está guardando' : '¿Descartar los cambios?'}</h2>
            <div className="bugie-muted small mt-1">
              {shown === 'busy'
                ? 'Espera a que termine. Si cierras ahora, puede que no veas el resultado.'
                : 'Lo que escribiste en esta ventana se perderá.'}
            </div>
          </div>
        </div>
      </Overlay>
    </div>,
    document.body,
  );
}

export type ModalProps = BaseProps;
export type DrawerProps = BaseProps;

/** Ventana centrada. En movil se apoya abajo. */
export function Modal(props: ModalProps) {
  return <Overlay kind="modal" {...props} />;
}

/** Panel lateral derecho. En movil ocupa toda la pantalla. Ideal para formularios largos y filtros. */
export function Drawer(props: DrawerProps) {
  return <Overlay kind="drawer" {...props} />;
}
