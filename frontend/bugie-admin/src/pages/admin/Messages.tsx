import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

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

// Plantillas predefinidas. El admin elige una y la edita libremente antes de enviar.
const TEMPLATES: { label: string; subject: (m: ContactItem) => string; body: string }[] = [
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

export default function Messages() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page,   setPage]   = useState(1);

  const [data,    setData]    = useState<PagedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Modal detalle
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, page]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        filter, page: String(page), pageSize: String(PAGE_SIZE),
      });
      const res = await apiFetch<PagedResponse>(
        `${API.landing}/landing/contact?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }

  // Stats simples para los KPIs
  const stats = useMemo(() => {
    if (!data) return { total: 0, unread: 0, read: 0, replied: 0 };
    const unread  = data.items.filter(m => !m.isRead).length;
    const read    = data.items.filter(m => m.isRead).length;
    const replied = data.items.filter(m => m.repliesCount > 0).length;
    return { total: data.total, unread, read, replied };
  }, [data]);

  const totalPages = data?.totalPages ?? 1;
  const fromIdx = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const toIdx   = data ? Math.min(page * PAGE_SIZE, data.total) : 0;

  return (
    <>
      <PageHeader
        title="Mensajes de contacto"
        subtitle="Bandeja de mensajes recibidos desde el formulario público. Marca como leído y responde por correo."
        icon="fa-solid fa-envelope"
      />

      {/* KPIs */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total',        value: stats.total,   color: '#818cf8', icon: 'fa-envelope'    },
          { label: 'Sin leer',     value: stats.unread,  color: '#f59e0b', icon: 'fa-circle'      },
          { label: 'Leídos',       value: stats.read,    color: '#34d399', icon: 'fa-circle-check'},
          { label: 'Con respuesta',value: stats.replied, color: '#a78bfa', icon: 'fa-reply'       },
        ].map(k => (
          <div className="col-md-3 col-sm-6" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%',
                              background: k.color + '22',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading ? '…' : k.value.toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs filtro */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="d-flex gap-2">
          {([
            { key: 'all',    label: 'Todos'    },
            { key: 'unread', label: 'Sin leer' },
            { key: 'read',   label: 'Leídos'   },
          ] as { key: Filter; label: string }[]).map(f => (
            <button key={f.key}
              className={`btn btn-sm rounded-pill ${filter === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
              onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto" onClick={load}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading && !data && (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      )}

      {!loading && data && data.items.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <i className="fa-solid fa-envelope-open fa-2x mb-3 d-block bugie-muted" />
          <div className="fw-semibold mb-1">Sin mensajes</div>
          <div className="small bugie-muted">No hay mensajes en esta categoría.</div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="d-flex flex-column gap-2">
            {data.items.map(m => (
              <div key={m.id} className="bugie-card px-3 py-3"
                   style={{ overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
                   onClick={() => setOpenId(m.id)}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: m.isRead ? '#34d399' : '#f59e0b',
                  borderRadius: '12px 0 0 12px',
                }} />
                <div className="d-flex align-items-center gap-3 ps-1 flex-wrap">
                  <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                background: m.isRead ? 'rgba(52,211,153,0.15)' : 'rgba(245,158,11,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-envelope"
                       style={{ color: m.isRead ? '#34d399' : '#f59e0b' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                      <span className="fw-semibold">{m.name}</span>
                      <span className="badge rounded-pill"
                            style={{
                              background: m.isRead ? 'rgba(52,211,153,0.2)' : 'rgba(245,158,11,0.2)',
                              color:      m.isRead ? '#34d399'              : '#f59e0b',
                              fontSize: '0.72rem' }}>
                        <i className={`fa-solid ${m.isRead ? 'fa-circle-check' : 'fa-clock'} me-1`}
                           style={{ fontSize: '0.65rem' }} />
                        {m.isRead ? 'Leído' : 'Sin leer'}
                      </span>
                      {m.repliesCount > 0 && (
                        <span className="badge rounded-pill"
                              style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
                                       fontSize: '0.72rem' }}>
                          <i className="fa-solid fa-reply me-1" style={{ fontSize: '0.65rem' }} />
                          {m.repliesCount}
                        </span>
                      )}
                    </div>
                    <div className="small bugie-muted text-truncate">
                      <strong>{m.subject}</strong> · {m.email}
                    </div>
                    <div className="small bugie-muted text-truncate"
                         style={{ marginTop: 2 }}>
                      {m.message}
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="small bugie-muted">
                      {new Date(m.createdAt).toLocaleDateString('es-PE',
                        { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{data.total.toLocaleString('es-PE')}</strong>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(1)} disabled={page === 1}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">
                Página {page} de {totalPages}
              </span>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* Modal detalle / respuesta */}
      {openId && (
        <DetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => { setOpenId(null); load(); }}
        />
      )}
    </>
  );
}

// ─── Modal detalle + responder ──────────────────────────────────────────────
function DetailModal({ id, onClose, onChanged }:
  { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail,  setDetail]  = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Editor de respuesta
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [sendOk,  setSendOk]  = useState<string | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<DetailResponse>(`${API.landing}/landing/contact/${id}`);
      setDetail(res);
      setSubject(`Re: ${res.subject}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleRead() {
    if (!detail) return;
    const endpoint = detail.isRead ? 'unread' : 'read';
    try {
      await apiFetch(`${API.landing}/landing/contact/${id}/${endpoint}`, { method: 'PUT' });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar.');
    }
  }

  function applyTemplate(t: typeof TEMPLATES[number]) {
    if (!detail) return;
    setSubject(t.subject(detail as any));
    setBody(t.body);
  }

  async function send() {
    if (!detail) return;
    if (!subject.trim() || !body.trim()) {
      setError('Completa asunto y cuerpo.');
      return;
    }
    setSending(true); setError(null); setSendOk(null);
    try {
      const reply = await apiFetch<ReplyItem>(
        `${API.landing}/landing/contact/${id}/reply`,
        { method: 'POST', body: JSON.stringify({ subject, body }) });
      if (reply.status === 'sent') {
        setSendOk('Respuesta enviada correctamente.');
      } else {
        setError(`No se pudo enviar: ${reply.errorMessage ?? 'error desconocido'}.`);
      }
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal show d-block"
         style={{
           // Position fija a la ventana y z-index alto para que aparezca
           // por encima del sidebar/header. Sin esto, el modal queda
           // atrapado dentro del contenedor del admin y no se ve.
           position: 'fixed',
           top: 0, left: 0, right: 0, bottom: 0,
           background: 'rgba(0,0,0,0.5)',
           zIndex: 1055,
           overflowY: 'auto',
         }}
         onClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable"
           style={{ marginTop: 60 }}
           onClick={e => e.stopPropagation()}>
        <div className="modal-content bugie-card" style={{ borderRadius: 16 }}>
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bugie-border)' }}>
            <h5 className="modal-title">
              <i className="fa-solid fa-envelope-open me-2" style={{ color: '#818cf8' }} />
              Mensaje de contacto
            </h5>
            <button className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body">
            {loading && <div className="text-center py-4"><span className="spinner-border" /></div>}
            {error   && <div className="alert alert-danger small">{error}</div>}
            {sendOk  && <div className="alert alert-success small">{sendOk}</div>}

            {detail && (
              <>
                {/* Mensaje original */}
                <div className="mb-3 p-3"
                     style={{ background: 'var(--bugie-bg-soft)', borderRadius: 12 }}>
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                    <div>
                      <div className="fw-semibold">{detail.name}</div>
                      <div className="small bugie-muted">{detail.email}</div>
                    </div>
                    <div className="text-end">
                      <div className="small bugie-muted">
                        {new Date(detail.createdAt).toLocaleString('es-PE')}
                      </div>
                      <button className="btn btn-sm btn-bugie-outline rounded-pill mt-2"
                              onClick={toggleRead}>
                        <i className={`fa-solid ${detail.isRead ? 'fa-envelope' : 'fa-circle-check'} me-1`} />
                        {detail.isRead ? 'Marcar como no leído' : 'Marcar como leído'}
                      </button>
                    </div>
                  </div>
                  <div className="fw-semibold mb-2">{detail.subject}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{detail.message}</div>
                </div>

                {/* Historial de respuestas */}
                {detail.replies.length > 0 && (
                  <div className="mb-3">
                    <div className="small bugie-muted text-uppercase mb-2">
                      Historial de respuestas
                    </div>
                    {detail.replies.map(r => (
                      <div key={r.id} className="p-3 mb-2"
                           style={{ background: r.status === 'sent'
                                    ? 'rgba(52,211,153,0.05)'
                                    : 'rgba(239,68,68,0.05)',
                                    border: `1px solid ${r.status === 'sent'
                                      ? 'rgba(52,211,153,0.3)'
                                      : 'rgba(239,68,68,0.3)'}`,
                                    borderRadius: 12 }}>
                        <div className="d-flex justify-content-between flex-wrap mb-2">
                          <div className="small fw-semibold">
                            <i className={`fa-solid ${r.status === 'sent'
                              ? 'fa-paper-plane' : 'fa-triangle-exclamation'} me-1`}
                              style={{ color: r.status === 'sent' ? '#34d399' : '#ef4444' }} />
                            {r.adminName ?? 'Admin'}
                            {r.status === 'failed' && (
                              <span className="ms-2 badge" style={{
                                background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                FALLÓ
                              </span>
                            )}
                          </div>
                          <div className="small bugie-muted">
                            {new Date(r.createdAt).toLocaleString('es-PE')}
                          </div>
                        </div>
                        <div className="small fw-semibold mb-1">{r.subject}</div>
                        <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>
                        {r.status === 'failed' && r.errorMessage && (
                          <div className="small mt-2" style={{ color: '#ef4444' }}>
                            <strong>Error:</strong> {r.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Editor */}
                <div className="mb-3">
                  <div className="small bugie-muted text-uppercase mb-2">Plantillas</div>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {TEMPLATES.map(t => (
                      <button key={t.label}
                              className="btn btn-sm btn-bugie-outline rounded-pill"
                              onClick={() => applyTemplate(t)}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <label className="form-label small bugie-muted text-uppercase">Asunto</label>
                  <input type="text" className="form-control mb-2"
                         value={subject} onChange={e => setSubject(e.target.value)} />

                  <label className="form-label small bugie-muted text-uppercase">Mensaje</label>
                  <textarea className="form-control" rows={8}
                            value={body} onChange={e => setBody(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--bugie-border)' }}>
            <button className="btn btn-bugie-outline rounded-pill" onClick={onClose}>
              Cerrar
            </button>
            <button className="btn btn-bugie text-white rounded-pill"
                    onClick={send} disabled={sending || !detail}>
              {sending
                ? <><span className="spinner-border spinner-border-sm me-2" /> Enviando…</>
                : <><i className="fa-solid fa-paper-plane me-1" /> Enviar respuesta</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
