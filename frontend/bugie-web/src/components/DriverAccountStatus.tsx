import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../state/api';
import { Field, Modal, Notice, SectionCard, useConfirm, useToast } from './ui';

/// Datos de GET /api/drivers/me que usa la tarjeta (status 4 = suspendido, 5 = rechazado).
export interface DriverAccountInfo {
  status: number;
  statusReason?: string | null;
  /** Último día de suspensión (hora de Perú). null con status 4 = indefinida. */
  suspendedUntil?: string | null;
  openReviewRequest?: { id: string; message: string; createdAt: string } | null;
}

const MIN = 10;
const MAX = 1000;

/// "2026-10-15T23:59:59" → "15/10/2026" (se lee el texto tal cual, sin zona horaria).
function fmtDay(iso?: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
/// Fecha y hora de Perú tal como la manda el backend → "15/10/2026 14:30".
function fmtDayTime(iso?: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtDay(iso);
}

/// Tarjeta del estado de la cuenta cuando está suspendida o rechazada.
/// Permite pedir una revisión (una abierta a la vez). No muestra nada con otros estados.
export default function DriverAccountStatus({ driver, onChanged }: { driver: DriverAccountInfo; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (driver.status !== 4 && driver.status !== 5) return null;

  const suspended = driver.status === 4;
  const title = suspended
    ? (driver.suspendedUntil ? `Tu cuenta está suspendida hasta el ${fmtDay(driver.suspendedUntil)}` : 'Tu cuenta está suspendida indefinidamente')
    : 'Tu registro no fue aceptado';
  const request = driver.openReviewRequest;

  const len = message.trim().length;
  const canSend = len >= MIN && len <= MAX && !sending;

  async function send() {
    const ok = await confirm({
      title: '¿Enviar tu solicitud de revisión?',
      message: 'El equipo de Bugie revisará tu caso y te responderá por la app y por correo. Solo puedes tener una solicitud abierta a la vez.',
      confirmText: 'Enviar solicitud',
    });
    if (!ok) return;
    setSending(true); setError(null);
    try {
      await apiFetch(`${API.drivers}/drivers/me/review-request`, {
        method: 'POST', body: JSON.stringify({ message: message.trim() }),
      });
      toast.success('Tu solicitud fue enviada. Te avisaremos cuando la revisemos.');
      setOpen(false); setMessage('');
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la solicitud.');
    } finally { setSending(false); }
  }

  return (
    <SectionCard title="Estado de tu cuenta" icon={suspended ? 'fa-ban' : 'fa-circle-xmark'}>
      <div className="bx-stack">
        <Notice tone="bad" icon={suspended ? 'fa-ban' : 'fa-circle-xmark'} title={title}>
          {suspended
            ? 'Mientras dure la suspensión no puedes conectarte ni recibir viajes.'
            : 'No puedes conectarte ni recibir viajes.'}
          {driver.statusReason && (
            <div className="mt-2 text-break" style={{ whiteSpace: 'pre-line' }}><strong>Motivo:</strong> {driver.statusReason}</div>
          )}
        </Notice>

        {request ? (
          <Notice tone="info" icon="fa-hourglass-half"
                  title={`Solicitud enviada el ${fmtDayTime(request.createdAt)} — esperando respuesta`}>
            <div className="text-break" style={{ whiteSpace: 'pre-line' }}>«{request.message}»</div>
          </Notice>
        ) : (
          <Notice tone="primary" icon="fa-envelope-open-text" title="¿Crees que es un error?"
                  action={
                    <button className="btn btn-sm btn-bugie" onClick={() => { setError(null); setOpen(true); }}>
                      <i className="fa-solid fa-paper-plane" aria-hidden="true" />Solicitar revisión
                    </button>
                  }>
            Cuéntanos tu caso y el equipo de Bugie lo revisará.
          </Notice>
        )}

        <p className="small bx-muted mb-0">
          <i className="fa-solid fa-mobile-screen me-1" aria-hidden="true" />
          Puedes seguir subiendo o actualizando tus documentos desde la app Bugie
          (aquí puedes <Link to="/app/conductor/documentos">consultarlos</Link>).
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={sending}
        dirty="auto"
        title="Solicitar revisión"
        description={suspended ? 'Explica por qué debería levantarse tu suspensión.' : 'Explica por qué debería aceptarse tu registro.'}
        footer={
          <>
            <button className="btn btn-outline-secondary" onClick={() => setOpen(false)} disabled={sending}>Cancelar</button>
            <button className="btn btn-bugie" disabled={!canSend} onClick={send}>
              {sending
                ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Enviando…</>
                : <><i className="fa-solid fa-paper-plane" aria-hidden="true" />Enviar</>}
            </button>
          </>
        }
      >
        <div className="bx-stack">
          <Field label="Tu mensaje" required
                 help={`${len}/${MAX} caracteres${len < MIN ? ` (mínimo ${MIN})` : ''}`}
                 error={len > 0 && len < MIN ? `Escribe al menos ${MIN} caracteres.` : undefined}>
            <textarea className="form-control" rows={5} maxLength={MAX} value={message}
                      onChange={e => setMessage(e.target.value)} disabled={sending}
                      placeholder="Ej.: Ya renové mi SOAT y subí el documento nuevo desde la app." />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
      </Modal>
    </SectionCard>
  );
}
