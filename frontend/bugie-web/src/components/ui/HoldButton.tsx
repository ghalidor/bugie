import { KeyboardEvent, PointerEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';

/**
 * Boton "mantener presionado" para acciones criticas (SOS).
 * Evita activaciones accidentales: hay que mantenerlo `holdMs` (1.5 s).
 *
 *  - Raton/tactil: mantener presionado. Soltar antes cancela.
 *  - Teclado: mantener Enter o Espacio. Soltar antes cancela.
 *  - Anillo de progreso mientras se mantiene y pulso sutil permanente.
 *  - Con "menos movimiento" sigue pidiendo mantener, pero sin animacion.
 *  - Al completar llama a onConfirm (el flujo de la pantalla sigue igual).
 */
export interface HoldButtonProps {
  onConfirm: () => void;
  children: ReactNode;
  disabled?: boolean;
  holdMs?: number;
  className?: string;
  /** Texto de ayuda visible bajo el boton. */
  help?: string;
  /** Icono FontAwesome (sin prefijo) dentro del anillo. Sin icono no se muestra el anillo. */
  icon?: string;
}

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

export function HoldButton({
  onConfirm, children, disabled, holdMs = 1500, className = '',
  help = 'Mantén presionado para activar', icon,
}: HoldButtonProps) {
  const helpId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>(0);
  const raf = useRef<number>(0);
  const keyHeld = useRef<string | null>(null);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const [holding, setHolding] = useState(false);

  function setProgress(p: number) {
    btnRef.current?.style.setProperty('--hold-p', String(p));
  }

  function stop() {
    window.clearTimeout(timer.current);
    cancelAnimationFrame(raf.current);
    timer.current = 0;
    keyHeld.current = null;
    setProgress(0);
    setHolding(false);
  }

  function start() {
    if (disabled || timer.current) return;
    setHolding(true);
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    if (!reduced) {
      const tick = (t: number) => {
        setProgress(Math.min(1, (t - t0) / holdMs));
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }
    // El tiempo lo manda un temporizador (no depende de la animacion).
    timer.current = window.setTimeout(() => {
      stop();
      confirmRef.current();
    }, holdMs);
  }

  useEffect(() => () => stop(), []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    start();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // sin "click" inmediato
    if (e.repeat || keyHeld.current) return;
    keyHeld.current = e.key;
    start();
  }

  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === keyHeld.current) { e.preventDefault(); stop(); }
  }

  return (
    <div className="bx-hold">
      <button
        ref={btnRef}
        type="button"
        className={`bx-sos-btn bx-hold-btn ${holding ? 'is-holding' : ''} ${className}`}
        disabled={disabled}
        aria-describedby={helpId}
        onPointerDown={onPointerDown}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={stop}
        onContextMenu={e => e.preventDefault()}
      >
        <span className="bx-hold-fill" aria-hidden="true" />
        {icon && (
          <span className="bx-hold-ring" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <circle className="bg" cx="24" cy="24" r={RING_R} />
              <circle className="fg" cx="24" cy="24" r={RING_R}
                      style={{ strokeDasharray: RING_C, ['--hold-c' as string]: RING_C }} />
            </svg>
            <i className={`fa-solid ${icon}`} />
          </span>
        )}
        <span className="bx-hold-label">{children}</span>
      </button>
      <p id={helpId} className="bx-hold-help" aria-live="polite">
        {holding ? 'Sigue presionando…' : help}
      </p>
    </div>
  );
}
