import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../../styles/landing.scss';
import {
  COMPLAINT_NOTES, COMPLAINT_STATUS,
  CONSUMER_TITLE, GOOD_TITLE, DETAIL_TITLE, COMPLAINTS,
  businessDaysText, complaintRules, fmtDateTime, fmtDay,
} from '../../content/landing/complaints';
import ComplaintSheetHeader from '../../components/landing/ComplaintSheetHeader';
import { useDocumentMeta } from '../../components/landing/useDocumentMeta';
import { SEO } from '../../content/landing/seo';
import { API } from '../../state/api';

/**
 * Consulta pública de una hoja de reclamación:
 *   /libro-reclamaciones/consulta/:code?t=token
 * El enlace llega en el correo de confirmación y en el de respuesta.
 * Muestra la hoja (solo lectura) y la respuesta de la empresa si ya existe.
 * El plazo es el de la hoja (responseDays). Una anulada se muestra como
 * "Anulada" (sin el motivo interno).
 */

interface PublicComplaint {
  code: string; createdAt: string;
  consumerName: string; consumerAddress: string; docType: string; docNumber: string;
  phone: string; email: string; guardianName: string | null;
  goodType: string; claimedAmount: number | null; goodDescription: string | null;
  complaintType: string; tripCode: string | null; reference: string | null;
  detail: string; request: string;
  status: 'pendiente' | 'respondida' | 'anulada'; dueDate: string; responseDays: number;
  response: string | null; respondedAt: string | null; voidedAt: string | null;
}

export default function ComplaintStatus() {
  const { code = '' } = useParams();
  // Consulta personal: no se indexa.
  useDocumentMeta({ ...SEO.complaintStatus, path: '/libro-reclamaciones', noindex: true });
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [data, setData] = useState<PublicComplaint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API.landing}/landing/complaints/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) throw new Error();
        setData(await r.json() as PublicComplaint);
      })
      .catch(() => setError(COMPLAINT_STATUS.notFound));
  }, [code, token]);

  return (
    <div className="bugie-complaints-page">
      <div className="container">
        <div className="bugie-card p-4 p-md-5">
          <ComplaintSheetHeader date={data ? fmtDateTime(data.createdAt) : '—'} number={data?.code} />

          {error ? (
            <div className="text-center py-4">
              <p className="mb-3">{error}</p>
              <Link to="/libro-reclamaciones" className="btn btn-bugie text-white px-4">{COMPLAINT_STATUS.backToBook}</Link>
            </div>
          ) : !data ? (
            <p className="bugie-muted py-4 text-center">
              <span className="spinner-border spinner-border-sm me-2" />{COMPLAINT_STATUS.loading}
            </p>
          ) : (
            <Sheet c={data} />
          )}
        </div>
      </div>
    </div>
  );
}

function Sheet({ c }: { c: PublicComplaint }) {
  const answered = c.status === 'respondida';
  const voided = c.status === 'anulada';
  const pending = !answered && !voided;
  return (
    <>
      {/* Estado */}
      <div className={`alert ${answered ? 'alert-success' : voided ? 'alert-secondary' : 'alert-warning'} d-flex flex-wrap gap-3 justify-content-between small`}>
        <span>
          <strong>{COMPLAINT_STATUS.statusLabel}:</strong>{' '}
          {answered ? COMPLAINT_STATUS.answered : voided ? COMPLAINT_STATUS.voided : COMPLAINT_STATUS.pending}
        </span>
        {pending && <span><strong>{COMPLAINT_STATUS.termLabel}:</strong> {businessDaysText(c.responseDays)}</span>}
        {pending && <span><strong>{COMPLAINT_STATUS.dueLabel}:</strong> {fmtDay(c.dueDate)}</span>}
        {voided && c.voidedAt && <span><strong>{COMPLAINT_STATUS.voidedAt}</strong> {fmtDateTime(c.voidedAt)}</span>}
      </div>

      <h5 className="fw-bold mt-4 mb-3">{CONSUMER_TITLE}</h5>
      <div className="row g-3">
        <Item col="col-12" label="Nombre completo">{c.consumerName}</Item>
        <Item col="col-12" label="Domicilio">{c.consumerAddress}</Item>
        <Item col="col-md-4" label={c.docType}>{c.docNumber}</Item>
        <Item col="col-md-4" label="Teléfono">{c.phone}</Item>
        <Item col="col-md-4" label="E-mail">{c.email}</Item>
        {c.guardianName && <Item col="col-12" label="Padre, madre o apoderado">{c.guardianName}</Item>}
      </div>

      <h5 className="fw-bold mt-4 mb-3">{GOOD_TITLE}</h5>
      <div className="row g-3">
        <Item col="col-md-4" label="Bien contratado">{c.goodType === 'producto' ? 'Producto' : 'Servicio'}</Item>
        <Item col="col-md-4" label="Monto reclamado">{c.claimedAmount != null ? `S/ ${c.claimedAmount.toFixed(2)}` : '—'}</Item>
        <Item col="col-12" label="Descripción">{c.goodDescription || '—'}</Item>
      </div>

      <h5 className="fw-bold mt-4 mb-3">{DETAIL_TITLE}</h5>
      <div className="row g-3">
        <Item col="col-md-4" label="Tipo">
          {c.complaintType === 'queja' ? 'Queja' : 'Reclamo'} <sup>({c.complaintType === 'queja' ? 2 : 1})</sup>
        </Item>
        <Item col="col-md-8" label={COMPLAINTS.tripLabel}>{c.tripCode || '—'}</Item>
        {c.reference && <Item col="col-12" label="Referencia">{c.reference}</Item>}
        <Item col="col-12" label="Detalle">{c.detail}</Item>
        <Item col="col-12" label="Pedido">{c.request}</Item>
      </div>

      {/* Respuesta */}
      <h5 className="fw-bold mt-4 mb-3">{COMPLAINT_STATUS.responseTitle}</h5>
      {answered ? (
        <div className="bugie-card p-3">
          <p className="small bugie-muted mb-2">{COMPLAINT_STATUS.respondedAt} {fmtDateTime(c.respondedAt)}</p>
          <div className="bugie-complaints-value">{c.response}</div>
        </div>
      ) : voided ? (
        <p className="bugie-muted small">{COMPLAINT_STATUS.voidedText}</p>
      ) : (
        <p className="bugie-muted small">{COMPLAINT_STATUS.noResponse}</p>
      )}

      <div className="small bugie-muted mt-4">
        {COMPLAINT_NOTES.map((n, i) => (
          <p key={n.num} className={i === COMPLAINT_NOTES.length - 1 ? 'mb-0' : 'mb-1'}>
            <sup>({n.num})</sup> <strong>{n.term}</strong> {n.text}
          </p>
        ))}
        <ul className="mt-2 mb-0">
          {complaintRules(c.responseDays).map(r => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </>
  );
}

function Item({ col, label, children }: { col: string; label: string; children: ReactNode }) {
  return (
    <div className={col}>
      <div className="small bugie-muted">{label}</div>
      <div className="bugie-complaints-value">{children}</div>
    </div>
  );
}
