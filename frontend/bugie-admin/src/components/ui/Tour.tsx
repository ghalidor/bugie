import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { storage, useLayer, useMediaQuery, usePrefersReducedMotion } from './hooks';

/**
 * Tour guiado ligero (sin librerias).
 *
 * Los pasos de cada pagina viven en src/tours/<clave>.json:
 *   { "steps": [ { "selector": "[data-tour='dash-stats']", "title": "…", "text": "…" } ] }
 * La clave es el nombre del archivo y coincide con <Page helpKey="clave">.
 * Marca los elementos con data-tour="…" para que el selector no se rompa
 * cuando cambien las clases.
 */
export interface TourStep {
  /** Selector CSS del elemento a resaltar. Si no existe en pantalla al empezar, el paso se salta. */
  selector?: string;
  title: string;
  text: string;
}

type TourFile = { steps: TourStep[] } | TourStep[];

const files = import.meta.glob<TourFile>('../../tours/*.json', { eager: true, import: 'default' });
const TOURS: Record<string, TourStep[]> = {};
for (const [path, data] of Object.entries(files)) {
  const key = path.split('/').pop()!.replace(/\.json$/, '');
  TOURS[key] = Array.isArray(data) ? data : (data?.steps ?? []);
}

const seenKey = (key: string) => `bugie_tour_seen:${key}`;

export interface TourApi {
  /** Inicia el tour de la clave (o con pasos propios). */
  start: (key: string, steps?: TourStep[]) => void;
  stop: () => void;
  /** true si existe src/tours/<key>.json con pasos. */
  hasTour: (key: string) => boolean;
  isSeen: (key: string) => boolean;
  /** Olvida que se vio (vuelve a salir solo la proxima vez). */
  resetSeen: (key: string) => void;
  activeKey: string | null;
}

const TourContext = createContext<TourApi | null>(null);

interface Running { key: string; steps: TourStep[]; index: number }

/** Monta una vez en la raiz (dentro del Router). */
export function TourProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<Running | null>(null);
  const location = useLocation();

  const stop = useCallback(() => {
    setRun(r => { if (r) storage.set(seenKey(r.key), '1'); return null; });
  }, []);

  const start = useCallback((key: string, steps?: TourStep[]) => {
    const all = steps ?? TOURS[key] ?? [];
    // Se saltan los pasos cuyo elemento no está en pantalla (por ejemplo, los de
    // otra pestaña o una acción que el rol no ve): así el tour no se rompe.
    // Si ninguno está en pantalla, se muestran todos centrados.
    const visible = all.filter(s => !s.selector || document.querySelector(s.selector));
    const list = visible.length > 0 ? visible : all;
    if (list.length === 0) return;
    // Se marca como visto apenas se muestra: aunque se cierre a medias o se
    // cambie de pagina, ya no se abre solo. Se vuelve a ver con el boton "?".
    storage.set(seenKey(key), '1');
    setRun({ key, steps: list, index: 0 });
  }, []);

  // Al cambiar de pagina se cierra el tour en curso.
  useEffect(() => { setRun(null); }, [location.pathname]);

  const api = useMemo<TourApi>(() => ({
    start,
    stop,
    hasTour: key => (TOURS[key]?.length ?? 0) > 0,
    isSeen: key => storage.get(seenKey(key)) === '1',
    resetSeen: key => storage.remove(seenKey(key)),
    activeKey: run?.key ?? null,
  }), [start, stop, run?.key]);

  return (
    <TourContext.Provider value={api}>
      {children}
      {run && (
        <TourOverlay
          run={run}
          onPrev={() => setRun(r => (r ? { ...r, index: Math.max(0, r.index - 1) } : r))}
          onNext={() => {
            if (run.index >= run.steps.length - 1) stop();
            else setRun(r => (r ? { ...r, index: r.index + 1 } : r));
          }}
          onSkip={stop}
        />
      )}
    </TourContext.Provider>
  );
}

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour() necesita <TourProvider> en la raíz.');
  return ctx;
}

/** Lanza el tour automaticamente la primera vez que se visita la pagina. */
export function useAutoTour(key: string | undefined, enabled = true) {
  const tour = useTour();
  useEffect(() => {
    if (!key || !enabled || !tour.hasTour(key) || tour.isSeen(key)) return;
    const t = setTimeout(() => tour.start(key), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}

/* ── Dibujo del tour ───────────────────────────────────────────────── */

const PAD = 6;

function TourOverlay({ run, onPrev, onNext, onSkip }: { run: Running; onPrev: () => void; onNext: () => void; onSkip: () => void }) {
  const step = run.steps[run.index];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const isSheet = !useMediaQuery('(min-width: 576px)');
  const reduced = usePrefersReducedMotion();
  const last = run.index === run.steps.length - 1;

  useLayer(true, onSkip);

  // Ubicar el elemento, llevarlo a la vista y medirlo.
  useEffect(() => {
    const el = step.selector ? document.querySelector<HTMLElement>(step.selector) : null;
    if (!el) { setRect(null); return; }
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
    if (isSheet) {
      // En movil la tarjeta va abajo: subir el elemento justo bajo la barra superior.
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bugie-nav-h')) || 60;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navH - 12, behavior });
    } else {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
    }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const t = setTimeout(measure, reduced ? 0 : 380);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, reduced, isSheet]);

  // Posicion de la tarjeta: debajo del elemento si cabe, si no arriba.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || isSheet) { setCardPos(null); return; }
    const c = card.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) { setCardPos({ top: (vh - c.height) / 2, left: (vw - c.width) / 2 }); return; }
    let top = rect.bottom + PAD + 12;
    if (top + c.height > vh - 12) top = rect.top - PAD - 12 - c.height;
    if (top < 12) top = Math.max(12, Math.min(vh - c.height - 12, rect.top + 12));
    const left = Math.max(12, Math.min(rect.left, vw - c.width - 12));
    setCardPos({ top, left });
  }, [rect, isSheet, run.index]);

  useEffect(() => { nextRef.current?.focus({ preventScroll: true }); }, [run.index]);

  const hole = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : { top: '50%', left: '50%', width: 0, height: 0 };

  return createPortal(
    <div className="bx-tour-layer" role="dialog" aria-modal="true" aria-labelledby="bx-tour-title" aria-describedby="bx-tour-text">
      <div className={`bx-tour-hole ${rect ? '' : 'no-target'}`} style={hole} />
      <div
        ref={cardRef}
        className={`bx-tour-card ${isSheet ? 'is-sheet' : ''}`}
        style={isSheet ? undefined : (cardPos ?? { top: -9999, left: -9999 })}
        key={run.index}
      >
        <div className="bx-tour-step">Paso {run.index + 1} de {run.steps.length}</div>
        <h2 id="bx-tour-title" className="bx-tour-title">{step.title}</h2>
        <p id="bx-tour-text" className="bx-tour-text">{step.text}</p>
        <div className="bx-tour-actions">
          <div className="bx-tour-dots" aria-hidden="true">
            {run.steps.map((_, i) => <span key={i} className={i === run.index ? 'on' : ''} />)}
          </div>
          {!last && <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={onSkip}>Saltar</button>}
          {run.index > 0 && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onPrev}>Anterior</button>}
          <button ref={nextRef} type="button" className="btn btn-sm btn-bugie px-3" onClick={onNext}>{last ? 'Entendido' : 'Siguiente'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
