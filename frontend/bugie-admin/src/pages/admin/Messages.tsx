import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  Drawer, EmptyState, Field, FilterBar, Page, Pagination, SectionCard, Skeleton, StatCard, StatGrid,
  StatusBadge, useConfirm, useToast,
} from '../../components/ui';
import './siteAdmin.scss';

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface ContactItem {
  id:          string;
  name:        string;
  email:       string;
  subject:     string;
  message:     string;
  isRead:      boolean;
  createdAt:   string;
  readAt:      string | null;
  lastReplyAt: string | null;
  repliesCount:number;
}
interface PagedResponse {
  page: number; pageSize: number; total: number; totalPages: number;
  filter: string; items: ContactItem[];
}
interface ReplyItem {
  id: string; adminUserId: string | null; adminName: string | null;
  subject: string; body: string;
  status: 'sent' | 'failed'; errorMessage: string | null; createdAt: string;
}
interface DetailResponse extends Omit<ContactItem,'repliesCount'> {
  replies: ReplyItem[];
}

// Plantillas. Se elige una y se edita libremente antes de enviar.
const TEMPLATES: { label: string; subject: (m: { subject: string }) => string; body: string }[] = [
  {
    label: 'Saludo cordial',
    subject: m => `Re: ${m.subject}`,
    body:
      'Gracias por contactarnos. Recibimos tu mensaje y queremos avisarte ' +
      'que ya estamos revisando lo que nos comentas.\n\nSi necesitas algo ' +
      'más, no dudes en escribirnos nuevamente.',
  },
  {
    label: 'Solicitar más información',
    subject: m => `Re: ${m.subject} — Necesitamos más detalles`,
    body:
      'Gracias por tu mensaje. Para poder ayudarte mejor, necesitamos algo ' +
      'más de información:\n\n• ¿Cuándo ocurrió lo que mencionas?\n• ¿Tienes ' +
      'alguna captura o evidencia?\n• ¿Cuál es tu número de pedido o usuario?\n\n' +
      'Quedamos atentos a tu respuesta.',
  },
  {
    label: 'Derivar a soporte',
    subject: m => `Re: ${m.subject} — Te conectaremos con soporte`,
    body:
      'Gracias por escribirnos. Tu consulta fue derivada a nuestro equipo de ' +
      'soporte. Ellos se comunicarán contigo a la brevedad por este mismo correo.',
  },
  {
    label: 'Agradecimiento',
    subject: m => `Re: ${m.subject}`,
    body:
      '¡Muchas gracias por tu mensaje! Apreciamos mucho que te tomes el tiempo ' +
      'de escribirnos. Tu opinión nos ayuda a seguir mejorando Bugie.',
  },
];

const PAGE_SIZE = 20;
type Filter = 'all' | 'unread' | 'read';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function Messages() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page,   setPage]   = useState(1);

  const [data,    setData]    = useState<PagedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // Totales reales de la bandeja (antes se contaban solo los de la página visible).
  const [counts,  setCounts]  = useState<{ all: number; unread: number } | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, page]);

  async function load() {
    setLoading(true); setLoadErr(null);
    try {
      const params = new URLSearchParams({ filter, page: String(page), pageSize: String(PAGE_SIZE) });
      const res = await apiFetch<PagedResponse>(`${API.landing}/landing/contact?${params.toString()}`);
      setData(res);
      loadCounts();
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : 'No se pudieron cargar los mensajes.');
    } finally {
      setLoading(false);
    }
  }

  /** Pide solo el total de "todos" y "sin leer" (mismo endpoint, 1 elemento). */
  async function loadCounts() {
    try {
      const [all, unread] = await Promise.all((['all', 'unread'] as const).map(f =>
        apiFetch<PagedResponse>(`${API.landing}/landing/contact?filter=${f}&page=1&pageSize=1`)));
      setCounts({ all: all.total, unread: unread.total });
    } catch { /* los totales son informativos */ }
  }

  const statsLoading = !counts;
  const all    = counts?.all ?? 0;
  const unread = counts?.unread ?? 0;

  return (
    <Page
      title="Mensajes de contacto"
      subtitle="Lo que te escriben desde el formulario de la web. Léelos y responde por correo."
      icon="fa-envelope"
      helpKey="messages"
      actions={[{ label: 'Actualizar', icon: 'fa-rotate-right', variant: 'secondary', onClick: load, loading }]}
    >
      <StatGrid tourId="msg-stats">
        <StatCard label="Total" value={all.toLocaleString('es-PE')} icon="fa-envelope" tone="primary" loading={statsLoading} onClick={() => setFilter('all')} />
        <StatCard label="Sin leer" value={unread.toLocaleString('es-PE')} icon="fa-envelope-circle-check" tone="warn" loading={statsLoading}
                  pulse={unread > 0} hint={unread > 0 ? 'Esperan tu respuesta' : 'Bandeja al día'} onClick={() => setFilter('unread')} />
        <StatCard label="Leídos" value={(all - unread).toLocaleString('es-PE')} icon="fa-envelope-open" tone="ok" loading={statsLoading} onClick={() => setFilter('read')} />
      </StatGrid>

      <SectionCard flush>
        <div className="p-3" data-tour="msg-filters">
          <FilterBar
            chips={[
              { value: 'all', label: 'Todos', count: counts?.all },
              { value: 'unread', label: 'Sin leer', count: counts?.unread },
              { value: 'read', label: 'Leídos', count: counts ? all - unread : undefined },
            ]}
            chip={filter} onChipChange={v => setFilter(v as Filter)}
          />
        </div>

        {loadErr && (
          <div className="px-3 pb-3">
            <div className="sa-note bx-tone-bad" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
            </div>
          </div>
        )}

        <div className="sa-rows" data-tour="msg-list" style={{ borderTop: '1px solid var(--bugie-border)' }}>
          {loading && !data ? (
            <div className="p-3"><Skeleton height={56} count={5} /></div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon="fa-envelope-open"
              variant={filter === 'unread' ? 'done' : 'empty'}
              title={filter === 'unread' ? '¡Bandeja al día!' : 'Sin mensajes'}
              text={filter === 'unread' ? 'No tienes mensajes por leer.' : 'No hay mensajes en esta vista.'}
            />
          ) : data.items.map(m => (
            <button key={m.id} type="button"
                    className={`sa-row sa-mail ${!m.isRead ? 'unread' : ''}`}
                    onClick={() => setOpenId(m.id)}
                    aria-label={`${m.isRead ? '' : 'Sin leer. '}Mensaje de ${m.name}: ${m.subject}`}>
              <span className="dot" aria-hidden="true" />
              <span className="sa-row-main">
                <span className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="who">{m.name}</span>
                  {m.repliesCount > 0 && (
                    <StatusBadge size="sm" tone="info" icon="fa-reply">
                      {m.repliesCount === 1 ? '1 respuesta' : `${m.repliesCount} respuestas`}
                    </StatusBadge>
                  )}
                </span>
                <span className="line"><span className="subj">{m.subject}</span> · {m.email}</span>
                <span className="line">{m.message}</span>
              </span>
              <span className="when">{fmtDate(m.createdAt)}</span>
            </button>
          ))}
        </div>

        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>

      <DetailDrawer
        id={openId}
        onClose={() => { setOpenId(null); load(); }}
      />
    </Page>
  );
}

// ─── Detalle + responder ────────────────────────────────────────────────────
function DetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast   = useToast();
  const confirm = useConfirm();

  const [detail,  setDetail]  = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!id) return;
    setDetail(null); setBody(''); setSubject(''); setError(null);
    load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load(msgId: string, keepSubject = false) {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<DetailResponse>(`${API.landing}/landing/contact/${msgId}`);
      setDetail(res);
      if (!keepSubject) setSubject(`Re: ${res.subject}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el mensaje.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleRead() {
    if (!detail || !id) return;
    const endpoint = detail.isRead ? 'unread' : 'read';
    setToggling(true);
    try {
      await apiFetch(`${API.landing}/landing/contact/${id}/${endpoint}`, { method: 'PUT' });
      setDetail(d => d ? { ...d, isRead: !d.isRead } : d);
      toast.success(detail.isRead ? 'Marcado como no leído.' : 'Marcado como leído.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar.');
    } finally { setToggling(false); }
  }

  async function applyTemplate(t: typeof TEMPLATES[number]) {
    if (!detail) return;
    if (body.trim() && body !== t.body && !(await confirm({
      title: '¿Reemplazar tu texto?', message: 'La plantilla reemplazará lo que ya escribiste.',
      confirmText: 'Usar plantilla', tone: 'warning',
    }))) return;
    setSubject(t.subject(detail));
    setBody(t.body);
  }

  async function send() {
    if (!detail || !id) return;
    if (!subject.trim() || !body.trim()) {
      setError('Completa el asunto y el mensaje.');
      return;
    }
    const ok = await confirm({
      title: '¿Enviar la respuesta?',
      message: <>Se enviará un correo a <strong>{detail.email}</strong>. No se puede deshacer.</>,
      confirmText: 'Enviar',
    });
    if (!ok) return;
    setSending(true); setError(null);
    try {
      const reply = await apiFetch<ReplyItem>(
        `${API.landing}/landing/contact/${id}/reply`,
        { method: 'POST', body: JSON.stringify({ subject, body }) });
      if (reply.status === 'sent') {
        toast.success(`Respuesta enviada a ${detail.email}.`);
      } else {
        toast.error(`No se pudo enviar: ${reply.errorMessage ?? 'error desconocido'}.`);
      }
      setBody('');
      await load(id, true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (sending) return;
    if (body.trim() && !(await confirm({
      title: '¿Cerrar sin enviar?', message: 'Tu respuesta todavía no se ha enviado y se perderá.',
      confirmText: 'Cerrar sin enviar', cancelText: 'Seguir escribiendo', tone: 'warning',
    }))) return;
    onClose();
  }

  return (
    <Drawer
      open={!!id}
      onClose={close}
      size="lg"
      title={detail ? detail.subject : 'Mensaje de contacto'}
      description={detail ? `${detail.name} · ${detail.email}` : undefined}
      footer={
        <>
          <button type="button" className="btn btn-bugie-outline" onClick={close} disabled={sending}>Cerrar</button>
          <button type="button" className="btn btn-bugie" onClick={send} disabled={sending || !detail || !body.trim()}>
            {sending
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Enviando…</>
              : <><i className="fa-solid fa-paper-plane me-2" aria-hidden="true" />Enviar respuesta</>}
          </button>
        </>
      }
    >
      {loading && !detail && <Skeleton height={80} count={3} />}

      {error && (
        <div className="sa-note bx-tone-bad mb-3" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{error}</span>
        </div>
      )}

      {detail && (
        <div className="d-grid gap-4">
          {/* Mensaje original */}
          <section className="sa-bubble sa-anim">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
              <div style={{ minWidth: 0 }}>
                <div className="fw-semibold">{detail.name}</div>
                <a className="small" href={`mailto:${detail.email}`}>{detail.email}</a>
                <div className="small bugie-muted">{new Date(detail.createdAt).toLocaleString('es-PE')}</div>
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                {detail.isRead
                  ? <StatusBadge tone="ok" icon="fa-envelope-open">Leído</StatusBadge>
                  : <StatusBadge tone="warn" icon="fa-envelope">Sin leer</StatusBadge>}
                <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                        onClick={toggleRead} disabled={toggling}>
                  {detail.isRead ? 'Marcar como no leído' : 'Marcar como leído'}
                </button>
              </div>
            </div>
            <p className="sa-pre">{detail.message}</p>
          </section>

          {/* Historial */}
          {detail.replies.length > 0 && (
            <section className="d-grid gap-2">
              <h3 className="h6 fw-bold mb-0">Respuestas enviadas ({detail.replies.length})</h3>
              {detail.replies.map(r => (
                <div key={r.id} className={`sa-bubble tone ${r.status === 'sent' ? 'bx-tone-ok' : 'bx-tone-bad'}`}>
                  <div className="d-flex justify-content-between flex-wrap gap-2 mb-1">
                    <span className="small fw-semibold">
                      <i className={`fa-solid ${r.status === 'sent' ? 'fa-paper-plane' : 'fa-triangle-exclamation'} me-1`} aria-hidden="true" />
                      {r.adminName ?? 'Admin'}
                      {r.status === 'failed' && <StatusBadge size="sm" tone="bad" className="ms-2">No se envió</StatusBadge>}
                    </span>
                    <span className="small bugie-muted">{new Date(r.createdAt).toLocaleString('es-PE')}</span>
                  </div>
                  <div className="small fw-semibold mb-1">{r.subject}</div>
                  <p className="small sa-pre">{r.body}</p>
                  {r.status === 'failed' && r.errorMessage && (
                    <div className="small mt-2"><strong>Error:</strong> {r.errorMessage}</div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Respuesta */}
          <section className="d-grid gap-3">
            <h3 className="h6 fw-bold mb-0">Responder por correo</h3>
            <div>
              <div className="small bugie-muted mb-2">Empieza con una plantilla (puedes editarla):</div>
              <div className="sa-chips-inline">
                {TEMPLATES.map(t => (
                  <button key={t.label} type="button" className="bx-chip" onClick={() => applyTemplate(t)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Asunto" required>
              <input type="text" className="form-control" value={subject} onChange={e => setSubject(e.target.value)} />
            </Field>
            <Field label="Mensaje" required help="Se envía como texto simple desde el correo de Bugie.">
              <textarea className="form-control" rows={8} value={body} onChange={e => setBody(e.target.value)} />
            </Field>
          </section>
        </div>
      )}
    </Drawer>
  );
}
