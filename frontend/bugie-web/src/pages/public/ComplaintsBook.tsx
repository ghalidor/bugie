import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/landing.scss';
import {
  COMPLAINTS, COMPLAINT_NOTES, DEFAULT_RESPONSE_DAYS, DOC_TYPES, complaintRules,
  CONSUMER_TITLE, CONSUMER_FIELDS, CONSUMER_CONTACT_FIELDS,
  GOOD_TITLE, GOOD_CHOICE, GOOD_FIELDS,
  DETAIL_TITLE, DETAIL_CHOICE, DETAIL_FIELDS,
  fmtDay,
  type ComplaintChoice, type ComplaintField,
} from '../../content/landing/complaints';
import ComplaintSheetHeader from '../../components/landing/ComplaintSheetHeader';
import { useDocumentMeta } from '../../components/landing/useDocumentMeta';
import { SEO } from '../../content/landing/seo';
import { Checkbox } from '../../components/ui';
import { API } from '../../state/api';
import { useCompany } from '../../hooks/useCompany';
import { authHeaders, getRole, getToken } from '../../state/session';

/**
 * Libro de Reclamaciones — formato Indecopi (Hoja de Reclamación) con el
 * diseño de la landing. Envía a POST /api/landing/complaints, que asigna el
 * número LR-AAAA-NNNNNN, calcula el plazo (días hábiles de la configuración,
 * que llegan en GET /api/landing/company) y manda la copia
 * por correo con el enlace de consulta.
 *
 * Se abre en pestaña independiente desde el footer (target="_blank").
 * Textos en src/content/landing/complaints.ts.
 */

interface TripOption {
  id: string;
  category?: 'city_ride' | 'delivery';
  serviceType?: number;
  originAddress: string;
  destAddress: string;
  createdAt: string;
}

interface CreateResult {
  code: string;
  accessToken: string;
  dueDate: string;
  emailSent: boolean;
}

/** Código corto del viaje (8 primeros caracteres del id). */
const tripCode = (id: string) => id.slice(0, 8).toUpperCase();

const OTHER = '__other__';

const INITIAL_FORM: Record<string, string> = {
  consumerName: '', consumerAddress: '', docType: 'DNI', docNumber: '',
  phone: '', email: '', emailConfirm: '', guardianName: '',
  goodType: 'servicio', claimedAmount: '', goodDescription: '',
  complaintType: 'reclamo', tripId: '', tripCode: '', reference: '',
  detail: '', request: '',
  // Campo trampa (anti-bot): una persona no lo ve ni lo llena.
  website: '',
};

/** Oculto fuera de pantalla (no display:none, para que los bots simples lo llenen). */
const HONEYPOT_STYLE: React.CSSProperties = {
  position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden',
};

export default function ComplaintsBook() {
  useDocumentMeta({ ...SEO.complaints, path: '/libro-reclamaciones' });
  const today = new Date().toLocaleDateString('es-PE');
  const company = useCompany();
  const responseDays = company?.complaintResponseDays ?? DEFAULT_RESPONSE_DAYS;
  const [form, setForm] = useState(INITIAL_FORM);
  const [isMinor, setIsMinor] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(CreateResult & { email: string }) | null>(null);

  // Pasajero con sesión: sus viajes y envíos recientes para elegir.
  const isPassenger = !!getToken() && getRole() === 'passenger';
  const [trips, setTrips] = useState<TripOption[] | null>(null);

  useEffect(() => {
    if (!isPassenger) return;
    // fetch directo (no apiFetch): si la sesión venció, no sacamos al
    // usuario de esta página pública; solo mostramos el campo de texto.
    fetch(`${API.trips}/trips/history/enriched`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() as Promise<TripOption[]> : null))
      .then(list => setTrips(list ? list.slice(0, 20) : null))
      .catch(() => setTrips(null));
  }, [isPassenger]);

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) {
      setError(COMPLAINTS.emailMismatch);
      return;
    }

    const selectedTrip = form.tripId && form.tripId !== OTHER ? form.tripId : null;
    const body = {
      consumerName: form.consumerName,
      consumerAddress: form.consumerAddress,
      docType: form.docType,
      docNumber: form.docNumber,
      phone: form.phone,
      email: form.email.trim(),
      emailConfirm: form.emailConfirm.trim(),
      guardianName: isMinor ? form.guardianName : null,
      goodType: form.goodType,
      claimedAmount: form.claimedAmount === '' ? null : Number(form.claimedAmount),
      goodDescription: form.goodDescription,
      complaintType: form.complaintType,
      tripId: selectedTrip,
      tripCode: selectedTrip ? tripCode(selectedTrip) : form.tripCode,
      reference: form.reference,
      detail: form.detail,
      request: form.request,
      website: form.website,
    };

    setSending(true);
    try {
      const res = await fetch(`${API.landing}/landing/complaints`, {
        method: 'POST',
        // Con sesión se manda el token para guardar quién la envió.
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? COMPLAINTS.sendError);
        return;
      }
      setResult({ ...(data as CreateResult), email: body.email });
      window.scrollTo(0, 0);
    } catch {
      setError(COMPLAINTS.sendError);
    } finally {
      setSending(false);
    }
  }

  function startOver() {
    setForm(INITIAL_FORM);
    setIsMinor(false);
    setResult(null);
    window.scrollTo(0, 0);
  }

  return (
    <div className="bugie-complaints-page">
      <div className="container">
        <div className="bugie-card p-4 p-md-5">

          <ComplaintSheetHeader date={today} number={result?.code} />

          {result ? (
            <Success result={result} onNew={startOver} />
          ) : (
            <form onSubmit={handleSubmit}>

              {/* Campo trampa (anti-bot): invisible y fuera del orden de tabulación. */}
              <div style={HONEYPOT_STYLE} aria-hidden="true">
                <label htmlFor="cb-website">Sitio web</label>
                <input id="cb-website" name="website" type="text" tabIndex={-1} autoComplete="off"
                       value={form.website} onChange={e => set('website', e.target.value)} />
              </div>

              {/* 1. Consumidor */}
              <h5 className="fw-bold mt-4 mb-3">{CONSUMER_TITLE}</h5>
              <div className="row g-3">
                {CONSUMER_FIELDS.map(f => <Field key={f.key} field={f} value={form[f.key]} onChange={set} />)}
                <div className="col-md-4">
                  <label className="form-label small" htmlFor="cb-docType">Tipo de documento *</label>
                  <select id="cb-docType" className="form-select" value={form.docType}
                          onChange={e => set('docType', e.target.value)}>
                    {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small" htmlFor="cb-docNumber">N° de documento *</label>
                  <input id="cb-docNumber" className="form-control" required
                         inputMode={form.docType === 'DNI' ? 'numeric' : 'text'}
                         pattern={form.docType === 'DNI' ? '\\d{8}' : '[A-Za-z0-9]{9,12}'}
                         title={form.docType === 'DNI' ? '8 dígitos' : 'Entre 9 y 12 letras o números'}
                         maxLength={form.docType === 'DNI' ? 8 : 12}
                         value={form.docNumber} onChange={e => set('docNumber', e.target.value)} />
                </div>
                {CONSUMER_CONTACT_FIELDS.map(f => <Field key={f.key} field={f} value={form[f.key]} onChange={set} />)}
                <div className="col-12">
                  <Checkbox size="sm" checked={isMinor} onChange={setIsMinor} label={COMPLAINTS.minorLabel} />
                </div>
                {isMinor && (
                  <Field
                    field={{ key: 'guardianName', label: COMPLAINTS.guardianLabel, col: 'col-12', required: true, maxLength: 150 }}
                    value={form.guardianName} onChange={set}
                  />
                )}
              </div>

              {/* 2. Bien contratado */}
              <h5 className="fw-bold mt-4 mb-3">{GOOD_TITLE}</h5>
              <RadioGroup choice={GOOD_CHOICE} value={form.goodType} onChange={set} />
              <div className="row g-3">
                {GOOD_FIELDS.map(f => <Field key={f.key} field={f} value={form[f.key]} onChange={set} />)}
              </div>

              {/* 3. Detalle */}
              <h5 className="fw-bold mt-4 mb-3">{DETAIL_TITLE}</h5>
              <RadioGroup choice={DETAIL_CHOICE} value={form.complaintType} onChange={set} />
              <div className="row g-3">
                <TripPicker trips={trips} form={form} onChange={set} />
                {DETAIL_FIELDS.map(f => <Field key={f.key} field={f} value={form[f.key]} onChange={set} />)}
              </div>

              {/* Notas legales */}
              <div className="small bugie-muted mt-4">
                {COMPLAINT_NOTES.map((n, i) => (
                  <p key={n.num} className={i === COMPLAINT_NOTES.length - 1 ? 'mb-0' : 'mb-1'}>
                    <sup>({n.num})</sup> <strong>{n.term}</strong> {n.text}
                  </p>
                ))}
                <ul className="mt-2 mb-0">
                  {complaintRules(responseDays).map(r => <li key={r}>{r}</li>)}
                </ul>
              </div>

              {error && <div className="alert alert-danger small mt-4 mb-0" role="alert">{error}</div>}

              {/* Botón enviar */}
              <div className="d-flex justify-content-end mt-4">
                <button type="submit" className="btn btn-bugie text-white px-4" disabled={sending}>
                  {sending
                    ? <><span className="spinner-border spinner-border-sm me-2" />{COMPLAINTS.sending}</>
                    : <><i className="fa-solid fa-paper-plane me-2" />{COMPLAINTS.submitLabel}</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mensaje final: número de hoja, correo enviado y enlace de consulta. */
function Success({ result, onNew }: { result: CreateResult & { email: string }; onNew: () => void }) {
  const consultUrl = `/libro-reclamaciones/consulta/${encodeURIComponent(result.code)}?t=${encodeURIComponent(result.accessToken)}`;
  return (
    <div className="text-center py-3" role="status">
      <i className="fa-solid fa-circle-check text-success fs-1 mb-3" aria-hidden="true" />
      <h2 className="bugie-h2 mb-2">{COMPLAINTS.successTitle}</h2>
      <p className="mb-1 bugie-muted">{COMPLAINTS.successNumber}</p>
      <p className="fs-3 fw-bold mb-3">{result.code}</p>
      <p className="mb-1">{result.emailSent ? COMPLAINTS.successEmail(result.email) : COMPLAINTS.successNoEmail}</p>
      <p className="small bugie-muted mb-4">{COMPLAINTS.successDue(fmtDay(result.dueDate))}</p>
      <div className="d-flex flex-wrap justify-content-center gap-2">
        <Link to={consultUrl} className="btn btn-bugie text-white px-4">
          <i className="fa-solid fa-file-lines me-2" />{COMPLAINTS.successConsult}
        </Link>
        <button type="button" className="btn btn-bugie-outline px-4" onClick={onNew}>
          {COMPLAINTS.successNew}
        </button>
      </div>
    </div>
  );
}

interface TripPickerProps {
  trips: TripOption[] | null;
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/** Viaje o envío relacionado: selector con el historial del pasajero
    (si tiene sesión) o campo de texto para el código. */
function TripPicker({ trips, form, onChange }: TripPickerProps) {
  const hasList = !!trips && trips.length > 0;
  const showText = !hasList || form.tripId === OTHER;

  return (
    <>
      {hasList && (
        <div className="col-12">
          <label className="form-label small" htmlFor="cb-trip">{COMPLAINTS.tripLabel}</label>
          <select id="cb-trip" className="form-select" value={form.tripId}
                  onChange={e => onChange('tripId', e.target.value)}>
            <option value="">{COMPLAINTS.tripSelectEmpty}</option>
            {trips!.map(t => {
              const isDelivery = t.category === 'delivery' || t.serviceType === 1;
              return (
                <option key={t.id} value={t.id}>
                  {fmtDay(t.createdAt)} · {isDelivery ? 'Envío' : 'Viaje'} #{tripCode(t.id)} · {t.originAddress} → {t.destAddress}
                </option>
              );
            })}
            <option value={OTHER}>{COMPLAINTS.tripSelectOther}</option>
          </select>
        </div>
      )}
      {showText && (
        <div className="col-12">
          <label className="form-label small" htmlFor="cb-tripCode">
            {hasList ? COMPLAINTS.tripCodeLabel : COMPLAINTS.tripLabel}
          </label>
          <input id="cb-tripCode" className="form-control" maxLength={60}
                 value={form.tripCode} onChange={e => onChange('tripCode', e.target.value)} />
          <div className="form-text small">{COMPLAINTS.tripHelp}</div>
        </div>
      )}
    </>
  );
}

interface FieldProps {
  field: ComplaintField;
  value: string;
  onChange: (key: string, value: string) => void;
}

/** Campo del formulario: etiqueta + input (o textarea si trae `rows`). */
function Field({ field: f, value, onChange }: FieldProps) {
  const id = `cb-${f.key}`;
  return (
    <div className={f.col}>
      <label className="form-label small" htmlFor={id}>{f.label}</label>
      {f.rows ? (
        <textarea
          id={id} className="form-control" rows={f.rows} required={f.required} maxLength={f.maxLength}
          value={value}
          onChange={e => onChange(f.key, e.target.value)}
        />
      ) : (
        <input
          id={id} className="form-control" type={f.type} step={f.step} required={f.required}
          maxLength={f.maxLength} min={f.type === 'number' ? 0 : undefined}
          value={value}
          onChange={e => onChange(f.key, e.target.value)}
        />
      )}
    </div>
  );
}

interface RadioGroupProps {
  choice: ComplaintChoice;
  value: string;
  onChange: (key: string, value: string) => void;
}

/** Grupo de opciones excluyentes (producto/servicio, reclamo/queja). */
function RadioGroup({ choice, value, onChange }: RadioGroupProps) {
  return (
    <div className="d-flex gap-4 mb-3">
      {choice.options.map(o => (
        <label key={o.value} className="d-flex align-items-center gap-2">
          <input
            type="radio" name={choice.name} value={o.value}
            checked={value === o.value}
            onChange={e => onChange(choice.name, e.target.value)}
          />
          {o.label}{o.note && <> <sup>({o.note})</sup></>}
        </label>
      ))}
    </div>
  );
}
