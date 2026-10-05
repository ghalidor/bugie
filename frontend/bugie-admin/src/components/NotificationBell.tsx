import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  InboxItem, adminInbox, fmtPeru, noticeStyle, timeAgo, useInboxSettings, useInboxUnread, useInboxVersion,
} from '../state/adminInbox';
import { NotifySettings } from '../state/adminNotify';
import { Drawer, EmptyState, Skeleton, useClickOutside, useConfirm, useIsMobile, useLayer, useToast } from './ui';
import './inbox.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Campana de avisos (barra superior): conteo de no leídos y los últimos
   avisos del historial. Escritorio: panel desplegable bajo la campana.
   Móvil: hoja completa (Drawer).
   El conteo se refresca al llegar un aviso en vivo (NotificationCenter →
   adminInbox.notifyLive), al abrir el panel y cada 2 minutos.
   ────────────────────────────────────────────────────────────────────────── */

const PANEL_SIZE = 15;
const POLL_MS = 2 * 60_000;
export const HISTORY_PATH = '/admin/avisos/historial';

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

export default function NotificationBell() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const confirm = useConfirm();
  const toast = useToast();
  const unread = useInboxUnread();
  const version = useInboxVersion();
  const settings = useInboxSettings();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null);

  // Conteo: al montar y cada 2 min.
  useEffect(() => {
    adminInbox.refreshCount();
    const t = setInterval(() => adminInbox.refreshCount(), POLL_MS);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await adminInbox.list({ page: 1, pageSize: PANEL_SIZE });
      setItems(r.items ?? []);
      adminInbox.setUnread(r.unread ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los avisos.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Al abrir: lista + conteo. Si llega un aviso con el panel abierto, recarga.
  useEffect(() => { if (open) load(items !== null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, load]);
  useEffect(() => { if (open && version > 0) load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [version]);

  const close = useCallback(() => setOpen(false), []);
  // Al cambiar de página se cierra.
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useClickOutside([btnRef, panelRef], open && !isMobile && !confirming, close);
  useLayer(open && !isMobile, close);

  // Posición del panel (escritorio): bajo la campana, alineado a su borde derecho.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const right = Math.max(8, window.innerWidth - b.right);
      setPos({ top: b.bottom + 8, right, maxHeight: Math.max(240, window.innerHeight - b.bottom - 24) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, isMobile]);

  function openItem(it: InboxItem) {
    if (!it.read) {
      setItems(list => list?.map(x => (x.id === it.id ? { ...x, read: true } : x)) ?? null);
      adminInbox.markRead(it.id, true).catch(() => {
        setItems(list => list?.map(x => (x.id === it.id ? { ...x, read: false } : x)) ?? null);
        toast.error('No se pudo marcar el aviso como leído.');
      });
    }
    if (it.link?.startsWith('/')) { setOpen(false); navigate(it.link); }
  }

  async function markAll() {
    setConfirming(true);
    const ok = await confirm({
      title: '¿Marcar todos como leídos?',
      message: 'Todos tus avisos quedarán como leídos. No se borra ninguno.',
      tone: 'primary',
      confirmText: 'Marcar todos',
    });
    setConfirming(false);
    if (!ok) return;
    setBusyAll(true);
    try {
      const n = await adminInbox.markAll();
      setItems(list => list?.map(x => ({ ...x, read: true })) ?? null);
      toast.success(n === 1 ? 'Se marcó 1 aviso como leído.' : `Se marcaron ${n.toLocaleString('es-PE')} avisos como leídos.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron marcar los avisos.');
    } finally {
      setBusyAll(false);
    }
  }

  function seeAll() { setOpen(false); navigate(HISTORY_PATH); }

  const label = unread > 0 ? `Avisos: ${unread} sin leer` : 'Avisos';

  const body = (
    <InboxList items={items} loading={loading && items === null} error={error} settings={settings}
               onOpen={openItem} onRetry={() => load()} />
  );
  const actions = (
    <>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={markAll}
              disabled={unread === 0 || busyAll}>
        {busyAll ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" /> : <i className="fa-solid fa-check-double me-1" aria-hidden="true" />}
        Marcar todos como leídos
      </button>
      <button type="button" className="btn btn-sm btn-bugie" onClick={seeAll}>
        Ver todos<i className="fa-solid fa-arrow-right ms-1" aria-hidden="true" />
      </button>
    </>
  );

  return (
    <>
      <button ref={btnRef} type="button" className="bx-icon-btn bx-bell" onClick={() => setOpen(o => !o)}
              aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}>
        <i className="fa-solid fa-bell" aria-hidden="true" />
        {unread > 0 && <span className="bx-bell-badge" aria-hidden="true">{badgeText(unread)}</span>}
      </button>

      {isMobile ? (
        <Drawer open={open} onClose={close} title="Avisos"
                description={unread > 0 ? `${unread.toLocaleString('es-PE')} sin leer` : 'Estás al día'}
                footer={<div className="bx-bell-foot">{actions}</div>}>
          <div className="bx-bell-sheet">{body}</div>
        </Drawer>
      ) : open && pos && createPortal(
        <div ref={panelRef} className="bx-bell-panel" role="dialog" aria-label="Avisos"
             style={{ top: pos.top, right: pos.right, maxHeight: pos.maxHeight }}>
          <div className="bx-bell-head">
            <span className="fw-bold">Avisos</span>
            <span className="small bugie-muted">{unread > 0 ? `${unread.toLocaleString('es-PE')} sin leer` : 'Estás al día'}</span>
          </div>
          <div className="bx-bell-body">{body}</div>
          <div className="bx-bell-foot">{actions}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Lista de avisos (panel de la campana y página de historial) ───── */

interface ListProps {
  items: InboxItem[] | null;
  loading: boolean;
  error: string | null;
  settings: NotifySettings;
  onOpen: (it: InboxItem) => void;
  onRetry?: () => void;
  /** Botón "Marcar leído" en cada fila (página de historial). */
  onMarkRead?: (it: InboxItem) => void;
  /** Muestra fecha completa además del tiempo relativo. */
  detailed?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  className?: string;
}

export function InboxList({ items, loading, error, settings, onOpen, onRetry, onMarkRead, detailed, emptyTitle, emptyText, className = '' }: ListProps) {
  if (loading) {
    return (
      <div className="bx-nlist-skel">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={52} radius={10} />)}
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState compact variant="error" title="No se pudieron cargar los avisos" text={error}
                  action={onRetry && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onRetry}>Reintentar</button>} />
    );
  }
  if (!items || items.length === 0) {
    return <EmptyState compact variant="done" title={emptyTitle ?? 'No tienes avisos'} text={emptyText ?? 'Aquí verás los avisos en vivo del panel.'} />;
  }
  return (
    <ul className={`bx-nlist ${className}`}>
      {items.map(it => {
        const st = noticeStyle(it.type, settings);
        return (
          <li key={it.id} className={`bx-nlist-item bx-tone-${st.color} ${it.read ? '' : 'is-unread'}`}>
            <button type="button" className="bx-nlist-main" onClick={() => onOpen(it)}
                    aria-label={`${it.read ? '' : 'Sin leer. '}${it.title}. ${it.message}`}>
              <span className="bx-nlist-icon" aria-hidden="true"><i className={`fa-solid ${st.icon}`} /></span>
              <span className="bx-nlist-text">
                <span className="bx-nlist-title">{it.title}</span>
                {it.message && <span className="bx-nlist-msg">{it.message}</span>}
                <span className="bx-nlist-meta">
                  {detailed && <span>{st.label}</span>}
                  <span title={fmtPeru(it.createdAt)}>{detailed ? fmtPeru(it.createdAt) : timeAgo(it.createdAt)}</span>
                  {detailed && it.read && it.readAt && <span>Leído el {fmtPeru(it.readAt)}</span>}
                </span>
              </span>
              {!it.read && <span className="bx-nlist-dot" aria-hidden="true" />}
            </button>
            {onMarkRead && (it.read
              ? <span className="bx-nlist-read is-done" title="Leído" aria-hidden="true"><i className="fa-solid fa-check-double" /></span>
              : (
                <button type="button" className="bx-icon-btn sm ghost bx-nlist-read" onClick={() => onMarkRead(it)}
                        aria-label="Marcar como leído" title="Marcar como leído">
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
