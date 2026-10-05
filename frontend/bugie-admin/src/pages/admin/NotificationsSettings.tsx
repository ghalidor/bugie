import { useEffect, useMemo, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import {
  DOC_DAYS_KEY, NOTICE_COLORS, NOTICE_TYPES, NOTIFY_CONFIG_EVENT, NOTIFY_PREVIEW_EVENT,
  NoticeConfig, NoticeType, NoticeTypeMeta, NotifyPreview, NotifySettings, ScheduleMode,
  defaultSettings, serializeConfig, settingKey, settingsFromRows,
} from '../../state/adminNotify';
import {
  Field, FormGrid, IconButton, Page, SaveBar, SectionCard, Select, Skeleton, Switch,
  useToast, useUnsavedChanges,
} from '../../components/ui';
import './notificationsSettings.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Sistema > Avisos: configura el Centro de avisos del panel.
   Por tipo: activo, color, segundos en pantalla y (recordatorios) cada cuánto.
   Además, los días antes del vencimiento en que se avisa de un documento.
   Todo se guarda en landing.SystemSettings (claves admin_notify_* y
   doc_expiry_alert_days) con PUT /landing/settings/{key}.
   ────────────────────────────────────────────────────────────────────────── */

const MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: 'none',     label: 'Solo al iniciar sesión' },
  { value: 'interval', label: 'Cada N horas' },
  { value: 'fixed',    label: 'Horas fijas del día' },
];

const PREVIEW_TEXT: Record<NoticeType, { title: string; message: string }> = {
  sos:                   { title: 'Alerta SOS', message: 'Juan Pérez (pasajero) activó el botón SOS en el viaje 3f2a9c1d.' },
  deviation:             { title: 'Un conductor se desvió de la ruta', message: 'Se alejó 420 m de la ruta planificada.' },
  contact_message:       { title: 'Nuevo mensaje de contacto', message: 'Llegó un mensaje nuevo desde el sitio web.' },
  complaint:             { title: 'Nueva reclamación', message: 'Se registró una reclamación en el libro.' },
  driver_review:         { title: 'Conductor por revisar', message: 'Un conductor envió sus documentos a revisión.' },
  passenger_review:      { title: 'Pasajero por aprobar', message: 'Un pasajero subió su DNI y espera aprobación.' },
  document_expiring:     { title: 'Hay 3 conductores con documentos por vencer', message: 'Vencen en los próximos 6 días o ya vencieron.' },
  pending_messages:      { title: 'Hay 2 mensajes sin atender', message: 'Mensajes de contacto que todavía no tienen respuesta.' },
  pending_complaints:    { title: 'Hay 1 reclamación pendiente', message: 'Respóndela dentro del plazo legal.' },
  pending_registrations: { title: 'Hay 4 conductores por revisar', message: 'Enviaron sus documentos y esperan tu revisión.' },
};

interface SettingRow { settingKey: string; value: string }

/** Lo que se guarda, en texto, para comparar con lo original. */
function toValues(s: NotifySettings): Record<string, string> {
  const out: Record<string, string> = {};
  NOTICE_TYPES.forEach(t => { out[settingKey(t.type)] = serializeConfig(t.type, s.config[t.type]); });
  out[DOC_DAYS_KEY] = s.docDays.join(',');
  return out;
}

export default function NotificationsSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<NotifySettings>(defaultSettings);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SettingRow[]>(`${API.landing}/landing/settings`)
      .then(rows => {
        const s = settingsFromRows(rows ?? []);
        setSettings(s);
        setOriginal(toValues(s));
      })
      .catch(err => setLoadErr(err instanceof ApiError ? err.message : 'No se pudo conectar con el servicio del sitio web.'))
      .finally(() => setLoading(false));
  }, []);

  const values = useMemo(() => toValues(settings), [settings]);
  const changed = useMemo(() => Object.keys(values).filter(k => values[k] !== original[k]), [values, original]);
  const dirty = !loading && !loadErr && changed.length > 0;
  useUnsavedChanges(dirty);

  const setConfig = (type: NoticeType, patch: Partial<NoticeConfig>) =>
    setSettings(s => ({ ...s, config: { ...s.config, [type]: { ...s.config[type], ...patch } } }));

  function validate(): string | null {
    for (const t of NOTICE_TYPES) {
      const c = settings.config[t.type];
      if (t.kind === 'reminder' && c.enabled && c.mode === 'fixed' && c.times.length === 0)
        return `"${t.label}": agrega al menos una hora fija.`;
      if (t.kind === 'reminder' && c.enabled && c.mode === 'none' && !c.onLogin)
        return `"${t.label}": activa "Al iniciar sesión" o elige una periodicidad.`;
    }
    if (settings.docDays.length === 0) return 'Agrega al menos un día de aviso para los documentos.';
    return null;
  }

  async function save() {
    const err = validate();
    if (err) { toast.warning(err); return; }
    setSaving(true);
    const keys = [...changed];
    const results = await Promise.allSettled(keys.map(key =>
      apiFetch(`${API.landing}/landing/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value: values[key] }) })));
    const ok = keys.filter((_, i) => results[i].status === 'fulfilled');
    const failed = keys.length - ok.length;
    if (ok.length > 0) {
      setOriginal(p => ({ ...p, ...Object.fromEntries(ok.map(k => [k, values[k]])) }));
      window.dispatchEvent(new CustomEvent(NOTIFY_CONFIG_EVENT, { detail: settings }));
    }
    if (failed === 0) toast.success('Configuración de avisos guardada.');
    else toast.error(`No se pudieron guardar ${failed} ajuste(s). Vuelve a intentarlo; si sigue fallando, avisa al equipo técnico.`);
    setSaving(false);
  }

  function discard() {
    const rows = Object.entries(original).map(([settingKey, value]) => ({ settingKey, value }));
    setSettings(settingsFromRows(rows));
  }

  function preview(t: NoticeTypeMeta) {
    const detail: NotifyPreview = { type: t.type, config: settings.config[t.type], ...PREVIEW_TEXT[t.type] };
    window.dispatchEvent(new CustomEvent(NOTIFY_PREVIEW_EVENT, { detail }));
  }

  const live = NOTICE_TYPES.filter(t => t.kind === 'live');
  const reminders = NOTICE_TYPES.filter(t => t.kind === 'reminder');

  return (
    <Page title="Avisos" icon="fa-bell" helpKey="notifications-settings"
          subtitle="Elige qué avisos aparecen arriba a la derecha, de qué color y cada cuánto."
          actions={[{ label: 'Ver historial', icon: 'fa-clock-rotate-left', variant: 'secondary', to: '/admin/avisos/historial' }]}>
      {loadErr && (
        <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-0" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span className="small">{loadErr}</span>
        </div>
      )}

      {loading ? (
        <div className="bx-nset">
          {[0, 1].map(i => <SectionCard key={i}><Skeleton height={56} count={3} /></SectionCard>)}
        </div>
      ) : !loadErr && (
        <div className="bx-nset">
          <SectionCard title="En vivo" icon="fa-bolt" flush tourId="nset-live"
                       description="Aparecen al momento en que pasa algo. Solo los ve quien tiene permiso para esa sección.">
            <ul className="bx-nset-list">
              {live.map(t => (
                <TypeRow key={t.type} meta={t} config={settings.config[t.type]}
                         onChange={p => setConfig(t.type, p)} onPreview={() => preview(t)} />
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Recordatorios" icon="fa-clock-rotate-left" flush tourId="nset-reminders"
                       description="Solo muestran cuántos casos hay (sin nombres) y no aparecen si no hay ninguno. Horas en hora de Perú.">
            <ul className="bx-nset-list">
              {reminders.map(t => (
                <TypeRow key={t.type} meta={t} config={settings.config[t.type]}
                         onChange={p => setConfig(t.type, p)} onPreview={() => preview(t)} />
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Vencimiento de documentos" icon="fa-calendar-xmark" tourId="nset-docs"
                       description="Días antes del vencimiento en que se avisa (correo al conductor y al admin, y el recordatorio de arriba). 0 = el mismo día.">
            <DocDaysEditor days={settings.docDays} onChange={docDays => setSettings(s => ({ ...s, docDays }))} />
          </SectionCard>
        </div>
      )}

      <SaveBar dirty={dirty} onSave={save} onDiscard={discard} saving={saving} />
    </Page>
  );
}

/* ── Fila de un tipo de aviso ───────────────────────────────────────── */

function TypeRow({ meta, config, onChange, onPreview }: {
  meta: NoticeTypeMeta;
  config: NoticeConfig;
  onChange: (patch: Partial<NoticeConfig>) => void;
  onPreview: () => void;
}) {
  const id = `nset-${meta.type}`;
  return (
    <li className={`bx-nset-row bx-tone-${config.color} ${config.enabled ? '' : 'is-off'}`}>
      <div className="bx-nset-head">
        <span className="bx-nset-icon" aria-hidden="true"><i className={`fa-solid ${meta.icon}`} /></span>
        <div className="bx-nset-name">
          <div className="fw-semibold">{meta.label}</div>
          <div className="small bugie-muted">{meta.description}</div>
        </div>
        <IconButton icon="fa-eye" label="Ver un aviso de prueba" size="sm" variant="ghost"
                    onClick={onPreview} disabled={!config.enabled} />
        <Switch checked={config.enabled} onChange={enabled => onChange({ enabled })} ariaLabel={`Activar: ${meta.label}`} />
      </div>

      {config.enabled && (
        <FormGrid className="bx-nset-body">
          <div className="bx-field">
            <span className="bx-field-label" id={`${id}-color-label`}>Color</span>
            <ColorPicker value={config.color} onChange={color => onChange({ color })} name={`${id}-color`} labelledBy={`${id}-color-label`} />
          </div>

          <Field label="Duración en pantalla" help="Se cierra solo; con el mouse encima se pausa.">
            <div className="input-group">
              <BlurNumberInput min={2} max={120} fallback={6} value={config.duration}
                               onCommit={duration => onChange({ duration })} />
              <span className="input-group-text">s</span>
            </div>
          </Field>

          {meta.kind === 'reminder' && (
            <>
              <div className="bx-col-full">
                <Switch checked={config.onLogin} onChange={onLogin => onChange({ onLogin })}
                        label="Al iniciar sesión" description="Se muestra una vez al entrar al panel." />
              </div>

              {/* Con "Cada N horas" va en fila con "Cada"; si no, ocupa toda la fila (sin huecos). */}
              <Field label="Además" span={config.mode === 'interval' ? undefined : 'full'}>
                <Select<ScheduleMode> value={config.mode} onChange={mode => onChange({ mode })} options={MODE_OPTIONS} />
              </Field>

              {config.mode === 'interval' && (
                <Field label="Cada" help="Cuenta desde la última vez que se mostró.">
                  <div className="input-group">
                    <BlurNumberInput min={1} max={48} fallback={6} value={config.everyHours}
                                     onCommit={everyHours => onChange({ everyHours })} />
                    <span className="input-group-text">horas</span>
                  </div>
                </Field>
              )}

              {config.mode === 'fixed' && (
                <div className="bx-col-full">
                  <TimesEditor times={config.times} onChange={times => onChange({ times })} />
                </div>
              )}
            </>
          )}
        </FormGrid>
      )}
    </li>
  );
}

const clamp = (n: number, min: number, max: number, d: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;

/// Número que se valida al salir del campo (o con Enter), no en cada tecla:
/// así se puede escribir 10-19 sin que el "1" se corrija a 2 mientras escribes.
function BlurNumberInput({ value, min, max, fallback, onCommit }: {
  value: number; min: number; max: number; fallback: number; onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = clamp(draft.trim() === '' ? NaN : Number(draft), min, max, fallback);
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input type="number" className="form-control" min={min} max={max} step={1} inputMode="numeric"
           value={draft}
           onChange={e => setDraft(e.target.value)}
           onBlur={commit}
           onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  );
}

/* ── Selector de color (tonos del tema) ─────────────────────────────── */

function ColorPicker({ value, onChange, name, labelledBy }: {
  value: string; onChange: (v: NoticeConfig['color']) => void; name: string; labelledBy: string;
}) {
  return (
    <div className="bx-nset-colors" role="radiogroup" aria-labelledby={labelledBy}>
      {NOTICE_COLORS.map(c => (
        <label key={c.value} className={`bx-nset-swatch bx-tone-${c.value}`} title={c.label}>
          <input type="radio" name={name} value={c.value} checked={value === c.value}
                 onChange={() => onChange(c.value)} className="visually-hidden" />
          <span aria-hidden="true" />
          <span className="visually-hidden">{c.label}</span>
        </label>
      ))}
    </div>
  );
}

/* ── Horas fijas del día ────────────────────────────────────────────── */

function TimesEditor({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('09:00');
  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(draft) || times.includes(draft)) return;
    onChange([...times, draft].sort());
  };
  return (
    <div className="bx-field">
      <span className="bx-field-label">Horas fijas (hora de Perú)</span>
      <div className="bx-nset-chips">
        {times.map(t => (
          <span key={t} className="bx-nset-chip">
            {t}
            <button type="button" onClick={() => onChange(times.filter(x => x !== t))} aria-label={`Quitar ${t}`}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </span>
        ))}
        {times.length === 0 && <span className="small bugie-muted">Sin horas: agrega una.</span>}
      </div>
      <div className="bx-input-row bx-nset-add">
        <input type="time" className="form-control" value={draft}
               onChange={e => setDraft(e.target.value)} aria-label="Nueva hora" />
        <button type="button" className="btn btn-outline-secondary" onClick={add} disabled={times.length >= 6}>
          <i className="fa-solid fa-plus me-1" aria-hidden="true" />Agregar
        </button>
      </div>
    </div>
  );
}

/* ── Días de aviso de vencimiento ───────────────────────────────────── */

function DocDaysEditor({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0 || n > 365 || days.includes(n)) return;
    onChange([...days, n].sort((a, b) => b - a));
    setDraft('');
  };
  return (
    <div className="bx-nset-chips-wrap">
      <div className="bx-nset-chips">
        {days.map(d => (
          <span key={d} className="bx-nset-chip">
            {d === 0 ? 'El mismo día' : d === 1 ? '1 día antes' : `${d} días antes`}
            <button type="button" onClick={() => onChange(days.filter(x => x !== d))} aria-label={`Quitar ${d} días`}
                    disabled={days.length <= 1}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="bx-input-row bx-nset-add">
        <div className="input-group">
          <input type="number" className="form-control" min={0} max={365} step={1} placeholder="Ej. 10"
                 value={draft} onChange={e => setDraft(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                 aria-label="Días antes del vencimiento" />
          <span className="input-group-text">días</span>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={add} disabled={days.length >= 6 || draft === ''}>
          <i className="fa-solid fa-plus me-1" aria-hidden="true" />Agregar
        </button>
      </div>
      <p className="small bugie-muted mb-0">
        Por defecto: 6, 3 y 0 días. El recordatorio cuenta los conductores con documentos que vencen dentro del mayor de estos días.
      </p>
    </div>
  );
}
