import { useEffect, useMemo, useState } from 'react';
import { apiFetch, API, ApiError } from '../../state/api';
import { invalidateMapConfigCache } from '../../hooks/useMapConfig';
import { isNotifySetting } from '../../state/adminNotify';
import BugieMapAdmin, { MapMarker } from '../../components/BugieMapAdmin';
import HolidaysSection from './HolidaysSection';
import {
  EmptyState, Field, Masonry, Page, SaveBar, SectionCard, Skeleton, Switch,
  useConfirm, useDebouncedValue, useToast, useUnsavedChanges,
} from '../../components/ui';
import './siteAdmin.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Configuración de la plataforma.

   Todos los parámetros se editan juntos y se guardan con un solo botón
   (barra inferior). Solo se envían los que cambiaron, uno por uno, con el
   mismo endpoint de siempre: PUT /landing/settings/{key}.
   Los feriados (abajo) se guardan al momento, cada uno por su cuenta.
   ────────────────────────────────────────────────────────────────────────── */

interface Setting {
  id: string; settingKey: string; value: string;
  description: string | null; updatedAt: string;
  /** UserId del admin que lo cambió por última vez (null = nunca se cambió desde el panel). */
  updatedBy?: string | null;
}

/** "03/10/2026 14:20" (hora de Perú que devuelve la API). */
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

type Kind = 'number' | 'text' | 'email' | 'tel' | 'bool';

interface Meta {
  label: string;
  help?: string;
  kind: Kind;
  unit?: string;
  prefix?: string;
  step?: string;
  min?: number;
  max?: number;
}

const META: Record<string, Meta> = {
  platform_fee_rate: { label: 'Comisión de la plataforma', help: 'Lo que el conductor le debe a Bugie por cada viaje completado.', kind: 'number', unit: '%', step: '0.1', min: 0, max: 100 },
  base_fare:         { label: 'Tarifa base mínima', help: 'Tarifa sugerida mínima al pedir un viaje (web y app).', kind: 'number', prefix: 'S/', step: '0.10', min: 0 },
  fare_per_km:       { label: 'Tarifa por kilómetro', help: 'Tarifa sugerida = km × este valor, nunca menos que la base.', kind: 'number', prefix: 'S/', step: '0.10', min: 0 },
  max_radius_km:     { label: 'Radio de búsqueda de conductores', help: 'Hasta dónde se avisa a los conductores de un viaje nuevo.', kind: 'number', unit: 'km', step: '0.5', min: 0 },
  sos_response_min:  { label: 'Tiempo objetivo de respuesta SOS', help: 'Se muestra en la pantalla SOS y el Centro SOS marca las alertas que la superan.', kind: 'number', unit: 'min', step: '1', min: 0 },
  support_email:     { label: 'Correo de soporte', help: 'Se muestra en la ayuda de la web y en Cuenta → Ayuda de la app.', kind: 'email' },
  support_phone:     { label: 'Teléfono de soporte', help: 'Se muestra en la ayuda de la web y en Cuenta → Ayuda de la app.', kind: 'tel' },
  default_city:      { label: 'Ciudad principal', help: 'Aparece en los correos que envía la plataforma.', kind: 'text' },
  default_lat:       { label: 'Latitud', help: 'Centro inicial de los mapas.', kind: 'number', step: '0.000001', min: -90, max: 90 },
  default_lng:       { label: 'Longitud', help: 'Centro inicial de los mapas.', kind: 'number', step: '0.000001', min: -180, max: 180 },
  default_zoom:      { label: 'Zoom', help: '1 = mundo, 18 = calle.', kind: 'number', step: '1', min: 1, max: 20 },
  deviation_detection_enabled: { label: 'Detección de desvío de ruta', kind: 'bool' },
  deviation_threshold_m:       { label: 'Distancia para considerar desvío', help: 'Alejamiento de la ruta planificada.', kind: 'number', unit: 'm', step: '10', min: 0 },
  complaint_response_days: { label: 'Plazo de respuesta', help: 'Se aplica a las reclamaciones nuevas; las ya registradas conservan su fecha límite.', kind: 'number', unit: 'días hábiles', step: '1', min: 1, max: 120 },
  complaint_due_soon_days: { label: 'Aviso de "por vencer"', help: 'Se marca cuando le quedan estos días hábiles o menos.', kind: 'number', unit: 'días hábiles', step: '1', min: 0, max: 120 },
};

const SECTIONS: { key: string; title: string; icon: string; description: string; keys: string[] }[] = [
  { key: 'fares', title: 'Tarifas y comisión', icon: 'fa-money-bill-wave',
    description: 'Tarifa sugerida al pedir un viaje, comisión de Bugie y alcance de la búsqueda de conductores.',
    keys: ['base_fare', 'fare_per_km', 'platform_fee_rate', 'max_radius_km'] },
  { key: 'map', title: 'Mapa y ciudad', icon: 'fa-map-location-dot',
    description: 'Punto inicial de todos los mapas del panel y la app.',
    keys: ['default_city', 'default_lat', 'default_lng', 'default_zoom'] },
  { key: 'security', title: 'Seguridad: SOS y desvío de ruta', icon: 'fa-shield-halved',
    description: 'Si el conductor se aleja de la ruta en 2 lecturas seguidas, se alerta en Monitoreo y se avisa al pasajero.',
    keys: ['sos_response_min', 'deviation_detection_enabled', 'deviation_threshold_m'] },
  { key: 'support', title: 'Contacto y soporte', icon: 'fa-headset',
    description: 'Datos que ven pasajeros y conductores para pedir ayuda.',
    keys: ['support_email', 'support_phone'] },
  { key: 'complaints', title: 'Libro de Reclamaciones', icon: 'fa-book',
    description: 'Plazos en días hábiles: no cuentan sábados, domingos ni los feriados activos.',
    keys: ['complaint_response_days', 'complaint_due_soon_days'] },
];

const MAP_KEYS = ['default_lat', 'default_lng', 'default_zoom'];
const KNOWN = new Set(SECTIONS.flatMap(s => s.keys));

const isTrue = (v: string | undefined) => (v ?? '').toLowerCase() === 'true';

/** Valor legible para el resumen de cambios (con su unidad). */
function showValue(key: string, value: string | undefined): string {
  const m = META[key];
  const v = (value ?? '').trim();
  if (m?.kind === 'bool') return isTrue(v) ? 'Activada' : 'Desactivada';
  if (!v) return '(vacío)';
  return `${m?.prefix ? m.prefix + ' ' : ''}${v}${m?.unit ? ' ' + m.unit : ''}`;
}

/** Devuelve un mensaje si el valor no es válido. */
function validate(key: string, value: string): string | null {
  const m = META[key];
  if (!m) return null;
  if (m.kind === 'number') {
    if (value.trim() === '') return 'Escribe un número.';
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Debe ser un número.';
    if (m.min != null && n < m.min) return `Mínimo ${m.min}.`;
    if (m.max != null && n > m.max) return `Máximo ${m.max}.`;
    if (m.step === '1' && !Number.isInteger(n)) return 'Debe ser un número entero.';
  }
  if (m.kind === 'email' && value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Correo no válido.';
  return null;
}

export default function Settings() {
  const toast = useToast();
  const confirm = useConfirm();
  // Nombre de los admins que hicieron la última modificación (UserId → nombre).
  const [names, setNames] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Setting[]>([]);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [values,   setValues]   = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  /** Lee los parámetros. keepEdits = conserva lo que se está editando (tras guardar una parte). */
  function loadSettings(keepEdits = false) {
    return apiFetch<Setting[]>(`${API.landing}/landing/settings`)
      .then(data => {
        setSettings(data);
        const vals: Record<string, string> = {};
        // trim: algunos valores se guardaron con espacios (ej. " -70.24") y el campo numérico los mostraba vacíos.
        data.forEach(s => { vals[s.settingKey] = (s.value ?? '').trim(); });
        setValues(prev => (keepEdits ? { ...vals, ...prev } : vals));
        setOriginal(vals);
        // Quién hizo la última modificación (nombres desde Auth; si falla, solo se muestra la fecha).
        const ids = [...new Set(data.map(s => s.updatedBy).filter((x): x is string => !!x))];
        if (ids.length > 0) {
          const qs = ids.map(id => `ids=${encodeURIComponent(id)}`).join('&');
          apiFetch<{ id: string; fullName: string }[]>(`${API.auth}/auth/users/bulk?${qs}`)
            .then(list => setNames(Object.fromEntries((list ?? []).map(u => [u.id, u.fullName]))))
            .catch(() => { /* sin nombres */ });
        }
      })
      .catch(err => setLoadErr(err instanceof ApiError ? err.message : 'No pudimos cargar la configuración. Vuelve a intentarlo.'))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSettings(); }, []);

  /** "Última modificación: fecha · por Nombre" de un grupo de parámetros (el cambio más reciente). */
  function lastChange(keys: string[]) {
    const list = settings.filter(s => keys.includes(s.settingKey) && s.updatedAt);
    if (list.length === 0) return null;
    const last = list.reduce((a, b) => (new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a));
    const who = last.updatedBy ? names[last.updatedBy] : null;
    return (
      <p className="small bugie-muted mb-0">
        <i className="fa-regular fa-clock me-1" aria-hidden="true" />
        Última modificación: {fmtWhen(last.updatedAt)}{who ? <> · por {who}</> : null}
        {keys.length > 1 && <> ({META[last.settingKey]?.label ?? last.settingKey})</>}
      </p>
    );
  }

  const changed = useMemo(() => Object.keys(values).filter(k => values[k] !== original[k]), [values, original]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    changed.forEach(k => { const msg = validate(k, values[k]); if (msg) e[k] = msg; });
    // "Por vencer" no puede ser mayor que el plazo de respuesta.
    const resp = Number(values.complaint_response_days), soon = Number(values.complaint_due_soon_days);
    if ((changed.includes('complaint_response_days') || changed.includes('complaint_due_soon_days'))
        && Number.isFinite(resp) && Number.isFinite(soon) && soon > resp && !e.complaint_due_soon_days) {
      e.complaint_due_soon_days = 'No puede ser mayor que el plazo de respuesta.';
    }
    return e;
  }, [changed, values]);
  const dirty = changed.length > 0;
  useUnsavedChanges(dirty);

  const set = (key: string, value: string) => setValues(p => ({ ...p, [key]: value }));
  const desc = (key: string) => settings.find(s => s.settingKey === key)?.description ?? undefined;

  async function saveAll() {
    if (Object.keys(errors).length > 0) {
      toast.warning('Revisa los campos marcados en rojo antes de guardar.');
      return;
    }
    // Resumen antes → después de cada cambio (tarifas y comisión afectan a todos los viajes nuevos).
    const ok0 = await confirm({
      title: changed.length === 1 ? '¿Guardar este cambio?' : `¿Guardar estos ${changed.length} cambios?`,
      message: (
        <div className="d-grid gap-2">
          <ul className="mb-0 ps-3">
            {changed.map(k => (
              <li key={k}><strong>{META[k]?.label ?? k}</strong>: {showValue(k, original[k])} → <strong>{showValue(k, values[k])}</strong></li>
            ))}
          </ul>
          {changed.some(k => ['base_fare', 'fare_per_km', 'platform_fee_rate'].includes(k)) && (
            <span className="small">Las tarifas y la comisión se aplican a los viajes nuevos desde ahora; los ya creados no cambian.</span>
          )}
        </div>
      ),
      confirmText: 'Guardar cambios',
      tone: changed.includes('platform_fee_rate') ? 'warning' : 'primary',
    });
    if (!ok0) return;
    setSaving(true);
    const keys = [...changed];
    const results = await Promise.allSettled(keys.map(key =>
      apiFetch(`${API.landing}/landing/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: values[key] }),
      })));
    const ok = keys.filter((_, i) => results[i].status === 'fulfilled');
    const failed = keys.filter((_, i) => results[i].status === 'rejected');

    if (ok.length > 0) {
      setOriginal(p => ({ ...p, ...Object.fromEntries(ok.map(k => [k, values[k]])) }));
      if (ok.some(k => MAP_KEYS.includes(k))) invalidateMapConfigCache();
      // Refresca "Última modificación" sin perder lo que no se pudo guardar.
      loadSettings(true);
    }
    if (failed.length === 0) {
      toast.success(ok.length === 1 ? 'Se guardó 1 cambio.' : `Se guardaron ${ok.length} cambios.`);
    } else {
      toast.error(`No se pudo guardar: ${failed.map(k => META[k]?.label ?? k).join(', ')}.`);
    }
    setSaving(false);
  }

  /* ── Vista previa del mapa ───────────────────────────────────────── */
  // Se debouncea un texto (no un objeto) para no re-renderizar en bucle.
  const mapKey = useDebouncedValue(`${values.default_lat ?? ''}|${values.default_lng ?? ''}|${values.default_zoom ?? ''}`, 600);
  const preview = useMemo(() => {
    const [rawLat, rawLng, rawZoom] = mapKey.split('|');
    if (rawLat.trim() === '' || rawLng.trim() === '') return null;
    const lat = Number(rawLat), lng = Number(rawLng), zoom = Number(rawZoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng, zoom: Number.isFinite(zoom) && zoom >= 1 && zoom <= 20 ? zoom : 14 };
  }, [mapKey]);
  const previewMarkers = useMemo<MapMarker[]>(
    () => preview ? [{ id: 'center', lat: preview.lat, lng: preview.lng, label: values.default_city || 'Centro del mapa' }] : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview]);

  /* ── Render de un campo ──────────────────────────────────────────── */
  /** Campos de una sección. Los sí/no van a lo ancho; en cada tramo de campos
   *  a media columna con número impar, el último se estira (sin celda vacía). */
  function renderFields(keys: string[]) {
    const isFull = (k: string) => META[k]?.kind === 'bool';
    const stretch = new Set<string>();
    let run: string[] = [];
    const flush = () => { if (run.length % 2 === 1) stretch.add(run[run.length - 1]); run = []; };
    keys.forEach(k => { if (isFull(k)) flush(); else run.push(k); });
    flush();
    return keys.map(k => renderField(k, stretch.has(k)));
  }

  function renderField(key: string, full = false) {
    const m = META[key] ?? { label: key, kind: 'text' as Kind };
    const value = values[key] ?? '';
    const isChanged = changed.includes(key);

    if (m.kind === 'bool') {
      const on = isTrue(value);
      return (
        <div key={key} className="bx-col-full">
          <Switch checked={on} onChange={v => set(key, v ? 'true' : 'false')}
                  label={<>{m.label}{isChanged && <span className="sa-tag-warn ms-2">sin guardar</span>}</>}
                  description={desc(key) ?? (on ? 'Activada: se vigila la ruta en cada viaje.' : 'Desactivada: no se generan alertas de desvío.')} />
        </div>
      );
    }

    const inputId = `setting-${key}`;
    const disabled = key === 'deviation_threshold_m' && values.deviation_detection_enabled !== undefined && !isTrue(values.deviation_detection_enabled);
    const input = (
      <input
        id={inputId}
        className="form-control"
        type={m.kind === 'number' ? 'number' : m.kind}
        inputMode={m.kind === 'number' ? 'decimal' : undefined}
        step={m.step}
        min={m.min}
        max={m.max}
        value={value}
        disabled={disabled}
        onChange={e => set(key, e.target.value)}
      />
    );

    return (
      <Field key={key} id={inputId} label={<>{m.label}{isChanged && <span className="sa-tag-warn">sin guardar</span>}</>}
             help={disabled ? 'Activa la detección de desvío para usar este valor.' : m.help}
             helpLong={desc(key)} error={errors[key]} span={full ? 'full' : undefined}
             className={isChanged ? 'sa-changed' : ''}>
        {m.unit || m.prefix ? (
          <div className="input-group" id={`${inputId}-group`}>
            {m.prefix && <span className="input-group-text">{m.prefix}</span>}
            {input}
            {m.unit && <span className="input-group-text">{m.unit}</span>}
          </div>
        ) : input}
      </Field>
    );
  }

  // company_* se editan en "Datos de la empresa" (con subida de logo): no se repiten aquí.
  const others = Object.keys(values).filter(k => !KNOWN.has(k) && !k.startsWith('company_') && !isNotifySetting(k));

  return (
    <Page
      title="Configuración de la plataforma"
      subtitle="Tarifas, mapa, seguridad, contacto y reclamaciones. Guarda todo junto al final."
      icon="fa-gear"
      helpKey="settings"
    >
      {loadErr && (
        <div className="sa-note bx-tone-bad" role="alert">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
        </div>
      )}

      {loading ? (
        <Masonry minColumnWidth={440}>
          {[0, 1, 2, 3].map(i => <SectionCard key={i}><Skeleton height={38} count={3} /></SectionCard>)}
        </Masonry>
      ) : !loadErr && settings.length === 0 ? (
        <SectionCard><EmptyState title="Sin parámetros" text="El servicio no devolvió ninguna configuración." /></SectionCard>
      ) : (
        <Masonry minColumnWidth={440}>
          {SECTIONS.map(sec => {
            const keys = sec.keys.filter(k => values[k] !== undefined);
            if (keys.length === 0) return null;
            return (
              <SectionCard key={sec.key} title={sec.title} icon={sec.icon} description={sec.description}
                           tourId={`settings-${sec.key}`} className="sa-anim">
                <div className="d-grid gap-3">
                  <div className="bx-form-grid">{renderFields(keys)}</div>
                  {lastChange(keys)}
                  {sec.key === 'map' && (
                    <div>
                      <div className="small fw-semibold mb-2">Vista previa</div>
                      {preview ? (
                        <div className="sa-map">
                          <BugieMapAdmin key={`${preview.lat},${preview.lng},${preview.zoom}`}
                                         center={{ lat: preview.lat, lng: preview.lng }} zoom={preview.zoom}
                                         markers={previewMarkers} height={220} />
                        </div>
                      ) : (
                        <p className="small bugie-muted mb-0">Escribe una latitud y longitud válidas para ver el mapa.</p>
                      )}
                      <p className="small bugie-muted mt-2 mb-0">
                        <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
                        Tip: en Google Maps, haz clic derecho sobre un punto para copiar sus coordenadas.
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}

          {others.length > 0 && (
            <SectionCard title="Otros parámetros" icon="fa-sliders" description="Valores que existen en el sistema y no tienen una sección propia.">
              <div className="bx-form-grid">{renderFields(others)}</div>
            </SectionCard>
          )}
        </Masonry>
      )}

      {/* Feriados: ancho completo, se guardan al momento (no usan la barra de guardado). */}
      {!loading && <HolidaysSection />}

      <SaveBar dirty={dirty} saving={saving} onSave={saveAll}
               onDiscard={() => setValues(original)}
               message={changed.length === 1 ? '1 cambio sin guardar' : `${changed.length} cambios sin guardar`}
               saveText="Guardar cambios" />
    </Page>
  );
}
