import { useContext, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { UNSAFE_NavigationContext } from 'react-router-dom';

/**
 * Transiciones suaves entre paginas del area de cuenta (/app/...) con la
 * View Transitions API (document.startViewTransition).
 *
 * La app usa <BrowserRouter> (no un "data router"), asi que la opcion
 * viewTransition de React Router no aplica. En su lugar se envuelven
 * push/replace del navegador del router SOLO mientras el AppShell esta
 * montado y SOLO para navegaciones dentro de /app/:
 *   1. el navegador toma la "foto" de la pagina actual,
 *   2. se cambia la ruta con flushSync (React pinta la nueva al instante),
 *   3. el CSS (app.scss, ::view-transition-*) anima el cambio (~250 ms).
 *
 * Respaldo: si el navegador no la soporta, si el usuario pidio menos
 * movimiento o si es atras/adelante, queda la animacion de entrada bxPageIn.
 * Mientras dura la transicion, <html> lleva la clase "bx-vt" para no
 * duplicar la animacion bxPageIn.
 */
type To = string | { pathname?: string };
type NavFn = (to: To, ...rest: unknown[]) => void;

function pathOf(to: To): string {
  if (typeof to === 'string') return to.startsWith('/') ? to : window.location.pathname;
  return to.pathname ?? window.location.pathname;
}

const isApp = (p: string) => p.startsWith('/app/');

export function useAppViewTransitions() {
  const { navigator } = useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { updateCallbackDone: Promise<void>; finished: Promise<void> } };
    if (typeof doc.startViewTransition !== 'function') return;

    const nav = navigator as unknown as { push: NavFn; replace: NavFn };
    const origPush = nav.push;
    const origReplace = nav.replace;
    // Mientras una transicion espera su turno, las siguientes navegaciones se
    // encolan detras para respetar el orden del historial.
    let pending: Promise<void> | null = null;

    const wrap = (orig: NavFn): NavFn => function (this: unknown, to, ...rest) {
      const run = () => orig.call(nav, to, ...rest);
      if (pending) { pending.then(run, run); return; }

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced || document.visibilityState !== 'visible'
          || !isApp(window.location.pathname) || !isApp(pathOf(to))) {
        run();
        return;
      }

      const root = document.documentElement;
      root.classList.add('bx-vt');
      try {
        const vt = doc.startViewTransition!(() => { flushSync(run); });
        const done = vt.updateCallbackDone.catch(() => {});
        pending = done.then(() => { pending = null; });
        vt.finished.catch(() => {}).finally(() => root.classList.remove('bx-vt'));
      } catch {
        root.classList.remove('bx-vt');
        pending = null;
        run();
      }
    };

    nav.push = wrap(origPush);
    nav.replace = wrap(origReplace);
    return () => {
      nav.push = origPush;
      nav.replace = origReplace;
      document.documentElement.classList.remove('bx-vt');
    };
  }, [navigator]);
}
