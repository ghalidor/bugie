import { useCallback, useEffect, useMemo, useState } from 'react';
import { rewardsAdminApi, RewardSetting, ExpirationResult, fmtPoints } from '../../../state/rewards';
import {
  Field, Page, SaveBar, SectionCard, Select, Skeleton, StatCard, StatGrid, StatusBadge, Switch, Tabs,
  useConfirm, useTabParam, useToast, useUnsavedChanges,
} from '../../../components/ui';
import { errMsg, LoadError } from './common';

type Kind = 'bool' | 'number' | 'text' | 'basis';

interface FieldDef {
  key:   string;
  label: string;
  /** Ayuda corta (una línea). */
  help:  string;
  /** Explicación larga: va en el "?" junto a la etiqueta. */
  long?: string;
  kind:  Kind;
}

interface Group { title: string; icon: string; fields: FieldDef[] }

/// Grupos de configuración, repartidos en pestañas. Las claves son exactamente las de rewards.settings.
const SECTIONS: { value: string; label: string; icon: string; groups: Group[] }[] = [
  {
    value: 'general', label: 'General', icon: 'fa-sliders',
    groups: [
      {
        title: 'Acumulación', icon: 'fa-coins',
        fields: [
          { key: 'points_enabled', kind: 'bool', label: 'Motor de puntos activo',
            help: 'Apagado, los viajes dejan de sumar puntos. Nada más cambia.' },
          { key: 'points_rate_passenger', kind: 'number', label: 'Puntos por S/ 1 — pasajero',
            help: 'Con 10, un viaje de S/ 15 da 150 puntos.', long: 'Usa punto decimal (por ejemplo 7.5).' },
          { key: 'points_rate_driver', kind: 'number', label: 'Puntos por S/ 1 — conductor',
            help: 'Con 5, un viaje de S/ 15 da 75 puntos.' },
          { key: 'points_level_basis', kind: 'basis', label: 'Cómo se calcula el nivel',
            help: 'Histórico: el nivel nunca baja.',
            long: 'Por puntos históricos el nivel nunca baja. Por saldo disponible, baja si el usuario canjea o le vencen puntos.' },
        ],
      },
      {
        title: 'Canje y cupones', icon: 'fa-gift',
        fields: [
          { key: 'redemption_enabled', kind: 'bool', label: 'Canje activo',
            help: 'Apagado, nadie puede canjear, pero se siguen acumulando puntos.' },
          { key: 'coupons_apply_to_fare', kind: 'bool', label: 'Los cupones descuentan del precio del viaje',
            help: 'Apagado, los cupones se canjean y se guardan, pero no descuentan.',
            long: 'Encendido: el pasajero puede aplicar uno de sus cupones a un viaje aceptado y paga menos. La comisión se calcula sobre lo que realmente paga.' },
        ],
      },
      {
        title: 'Promociones', icon: 'fa-bullhorn',
        fields: [
          { key: 'promotions_enabled', kind: 'bool', label: 'Promociones activas',
            help: 'Interruptor general: apagado, ninguna promoción suma puntos.' },
          { key: 'timezone_offset_hours', kind: 'number', label: 'Zona horaria (horas respecto a UTC)',
            help: 'Perú es -5.', long: 'Define a qué hora real corresponden los días y las franjas horarias de las promociones.' },
        ],
      },
    ],
  },
  {
    value: 'bonos', label: 'Bonos y logros', icon: 'fa-fire',
    groups: [
      {
        title: 'Racha y metas', icon: 'fa-fire',
        fields: [
          { key: 'streak_days', kind: 'number', label: 'Días seguidos para la racha',
            help: 'Con 0 se desactiva.', long: 'Se vuelve a pagar en cada bloque: a los 7, 14, 21 días…' },
          { key: 'streak_points', kind: 'number', label: 'Puntos al completar la racha',
            help: 'Se acreditan el día que se cierra el bloque.' },
          { key: 'weekly_goal_trips_passenger', kind: 'number', label: 'Meta semanal — pasajero',
            help: 'Viajes por semana. Con 0 se desactiva.', long: 'Viene en 0 porque 50 viajes es una cifra de conductor, no de pasajero.' },
          { key: 'weekly_goal_trips_driver', kind: 'number', label: 'Meta semanal — conductor',
            help: 'Servicios por semana para ganar el bono.' },
          { key: 'weekly_goal_points', kind: 'number', label: 'Puntos al cumplir la meta',
            help: 'Una vez por semana, aunque siga viajando.' },
          { key: 'anniversary_multiplier', kind: 'number', label: 'Multiplicador del mes de aniversario',
            help: 'Con 1 se desactiva.', long: 'Aplica durante el mes en que el usuario se registró. No aplica el primer año.' },
        ],
      },
      {
        title: 'Bono sin cancelaciones (conductor)', icon: 'fa-circle-check',
        fields: [
          { key: 'no_cancel_min_trips', kind: 'number', label: 'Viajes mínimos del día',
            help: 'Con 0 se desactiva la regla.',
            long: 'Viajes que el conductor debe completar ese día para optar al bono. Sin mínimo, quien no trabaja tendría cero cancelaciones y cobraría todos los días.' },
          { key: 'no_cancel_points', kind: 'number', label: 'Puntos del bono',
            help: 'Se paga de madrugada, mirando el día anterior.',
            long: 'Solo cuentan las cancelaciones del conductor: si el pasajero se arrepiente, el conductor no pierde el bono.' },
        ],
      },
      {
        title: 'Calificaciones', icon: 'fa-star',
        fields: [
          { key: 'rating_points_passenger', kind: 'number', label: 'Puntos al pasajero por calificar',
            help: 'Premia que se tome el trabajo de calificar.' },
          { key: 'rating_points_driver', kind: 'number', label: 'Puntos al conductor por recibir 5 estrellas',
            help: 'Solo con 5 estrellas.' },
          { key: 'rating_require_five_stars', kind: 'bool', label: 'Pagar al pasajero solo si pone 5 estrellas',
            help: 'Encendido sesga las notas: todos pondrían 5.',
            long: 'Encendido es lo que pide el documento de Player Tracking. Apagado, el pasajero cobra por calificar sin importar la nota y las calificaciones vuelven a ser útiles.' },
        ],
      },
    ],
  },
  {
    value: 'referidos', label: 'Referidos y sorteos', icon: 'fa-user-plus',
    groups: [
      {
        title: 'Referidos', icon: 'fa-user-plus',
        fields: [
          { key: 'referrals_enabled', kind: 'bool', label: 'Referidos activos',
            help: 'Apagado, el código deja de dar puntos. Lo ya acreditado no se toca.' },
          { key: 'referral_points_passenger', kind: 'number', label: 'Puntos por referir un pasajero',
            help: 'Cuando el invitado crea su cuenta con el código.' },
          { key: 'referral_points_driver', kind: 'number', label: 'Puntos por referir un conductor',
            help: 'Suele ser menor que el de pasajero.' },
          { key: 'referral_qualify_trips', kind: 'number', label: 'Viajes que debe completar el invitado',
            help: 'Para el bono extra. Con 0 se desactiva ese bono.' },
          { key: 'referral_qualify_points', kind: 'number', label: 'Bono extra al completarlos',
            help: 'Premia que el invitado se quede, no solo que se registre.' },
        ],
      },
      {
        title: 'Sorteos', icon: 'fa-dice',
        fields: [
          { key: 'raffles_enabled', kind: 'bool', label: 'Sorteos activos',
            help: 'Apagado, no se reparten tickets ni se ejecutan sorteos.' },
          { key: 'raffle_points_per_ticket', kind: 'number', label: 'Puntos del mes por ticket extra',
            help: 'Un ticket extra por cada N puntos del mes. Con 0 se desactiva.' },
        ],
      },
    ],
  },
  {
    value: 'vencimiento', label: 'Vencimiento', icon: 'fa-hourglass-half',
    groups: [
      {
        title: 'Vigencia de los puntos', icon: 'fa-hourglass-half',
        fields: [
          { key: 'points_expiry_enabled', kind: 'bool', label: 'Vencimiento activo',
            help: 'Apagado, los puntos no vencen y no se envían avisos.' },
          { key: 'points_expiry_months_passenger', kind: 'number', label: 'Vigencia en meses — pasajero',
            help: 'Cada viaje completado renueva el plazo de todo el saldo.' },
          { key: 'points_expiry_months_driver', kind: 'number', label: 'Vigencia en meses — conductor',
            help: 'Cada servicio completado renueva el plazo de todo el saldo.' },
          { key: 'points_expiry_warning_days', kind: 'text', label: 'Avisos push antes de vencer (días)',
            help: 'Separados por coma, por ejemplo 30,7,1.',
            long: '"30,7,1" avisa a los 30 días, a los 7 y el último día. "30" da un solo aviso.' },
        ],
      },
    ],
  },
];

const MAINT = 'mantenimiento';
const TAB_VALUES = [...SECTIONS.map(s => s.value), MAINT];
const ALL_FIELDS = SECTIONS.flatMap(s => s.groups.flatMap(g => g.fields));
const LABEL_BY_KEY = Object.fromEntries(ALL_FIELDS.map(f => [f.key, f.label]));

export default function SettingsTab() {
  const toast = useToast();
  const [tab] = useTabParam(TAB_VALUES, 'seccion');
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [values,   setValues]   = useState<Record<string, string>>({});
  const [loaded,   setLoaded]   = useState<RewardSetting[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  // Error devuelto por el backend para cada clave que no se pudo guardar.
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true); setLoadErr(null);
    rewardsAdminApi.settings()
      .then(data => {
        setLoaded(data);
        const v: Record<string, string> = {};
        data.forEach(s => { v[s.settingKey] = s.value; });
        setOriginal(v); setValues(v); setFieldErr({});
      })
      .catch(err => setLoadErr(errMsg(err, 'No se pudo conectar con el servicio de puntos.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const changed = useMemo(
    () => Object.keys(values).filter(k => values[k] !== original[k]),
    [values, original]);
  const dirty = changed.length > 0;
  useUnsavedChanges(dirty);

  const setValue = (key: string, v: string) => {
    setValues(p => ({ ...p, [key]: v }));
    setFieldErr(p => { if (!(key in p)) return p; const n = { ...p }; delete n[key]; return n; });
  };

  /** Guarda solo las claves que cambiaron. Si alguna falla, las demás quedan guardadas. */
  async function saveAll() {
    const empty = changed.filter(k => !(values[k] ?? '').trim());
    if (empty.length) {
      // El backend no acepta vacío: avisamos antes de enviar.
      setFieldErr(p => ({ ...p, ...Object.fromEntries(empty.map(k => [k, 'Ingresa un valor.'])) }));
      toast.error('Hay campos vacíos. Complétalos antes de guardar.');
      return;
    }
    setSaving(true);
    const results = await Promise.allSettled(
      changed.map(k => rewardsAdminApi.saveSetting(k, values[k].trim()).then(() => k)));
    const ok: string[] = [];
    const errs: Record<string, string> = {};
    results.forEach((r, i) => {
      const k = changed[i];
      if (r.status === 'fulfilled') ok.push(k);
      // El backend devuelve el motivo exacto, por ejemplo "use punto decimal".
      else errs[k] = errMsg(r.reason, 'No se pudo guardar.');
    });
    setOriginal(p => ({ ...p, ...Object.fromEntries(ok.map(k => [k, values[k].trim()])) }));
    setValues(p => ({ ...p, ...Object.fromEntries(ok.map(k => [k, values[k].trim()])) }));
    setFieldErr(errs);
    setSaving(false);
    if (ok.length && !Object.keys(errs).length) {
      toast.success(ok.length === 1 ? 'Se guardó 1 cambio. Ya está en vigor.' : `Se guardaron ${ok.length} cambios. Ya están en vigor.`);
    } else if (Object.keys(errs).length) {
      const names = Object.keys(errs).map(k => LABEL_BY_KEY[k] ?? k).join(', ');
      toast.error(`No se guardó: ${names}. Revisa el mensaje bajo cada campo.`, ok.length ? `${ok.length} cambio(s) sí se guardaron` : undefined);
    }
  }

  const discard = () => { setValues(original); setFieldErr({}); };

  // Cambios pendientes por pestaña, para el contador.
  const tabs = [
    ...SECTIONS.map(s => {
      const keys = s.groups.flatMap(g => g.fields.map(f => f.key));
      const n = keys.filter(k => changed.includes(k)).length;
      return { value: s.value, label: s.label, icon: s.icon, count: n > 0 ? n : undefined };
    }),
    { value: MAINT, label: 'Mantenimiento', icon: 'fa-screwdriver-wrench' },
  ];

  const known = new Set(ALL_FIELDS.map(f => f.key));
  const extra = loaded.filter(s => !known.has(s.settingKey));
  const section = SECTIONS.find(s => s.value === tab);

  return (
    <Page
      title="Ajustes de puntos"
      subtitle="Reglas del programa. Lo que guardes aquí rige en el acto, sin reiniciar nada."
      icon="fa-sliders"
      helpKey="rewards-settings"
    >
      <div data-tour="rw-set-tabs"><Tabs items={tabs} param="seccion" ariaLabel="Secciones de ajustes" /></div>

      {loading ? (
        <SectionCard><Skeleton count={6} height={18} /></SectionCard>
      ) : loadErr && loaded.length === 0 ? (
        // Si la carga falló no dibujamos el formulario vacío: haría creer que faltan claves en la base.
        <SectionCard><LoadError text={loadErr} onRetry={load} /></SectionCard>
      ) : tab === MAINT ? (
        <ExpirationRunner />
      ) : section && (
        <div className="rw-settings-grid" data-tour="rw-set-fields">
          {section.groups.map(g => (
            <SectionCard key={g.title} title={g.title} icon={g.icon}>
              <div className="rw-setting-list">
                {g.fields.map(f => (
                  <SettingField
                    key={f.key}
                    def={f}
                    value={values[f.key] ?? ''}
                    missing={!(f.key in original)}
                    changed={changed.includes(f.key)}
                    error={fieldErr[f.key]}
                    onChange={v => setValue(f.key, v)}
                  />
                ))}
              </div>
            </SectionCard>
          ))}
          {tab === 'general' && extra.length > 0 && (
            <SectionCard title="Otras claves en la base" icon="fa-database" description="Existen en la base pero no tienen un campo en esta pantalla. El motor de puntos no las usa.">
              <div className="small" style={{ overflowWrap: 'anywhere' }}>
                {extra.map(s => <div key={s.settingKey}><code>{s.settingKey}</code> = {s.value}</div>)}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={saveAll}
        onDiscard={discard}
        message={changed.length === 1 ? 'Tienes 1 cambio sin guardar' : `Tienes ${changed.length} cambios sin guardar`}
        saveText="Guardar cambios"
      />
    </Page>
  );
}

function SettingField({ def, value, missing, changed, error, onChange }: {
  def: FieldDef; value: string; missing: boolean; changed: boolean; error?: string;
  onChange: (v: string) => void;
}) {
  const help = missing ? 'Falta en la base: se usa el valor por defecto. Corre los scripts SQL para poder editarla.' : def.help;
  const label = <>{def.label}{changed && <span className="rw-dirty-dot" title="Cambio sin guardar" />}</>;

  if (def.kind === 'bool') {
    return (
      <div>
        <Switch
          checked={value === 'true'}
          onChange={c => onChange(c ? 'true' : 'false')}
          disabled={missing}
          label={label}
          description={help}
        />
        {error && <p className="bx-field-error mt-1" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />{error}</p>}
      </div>
    );
  }

  return (
    <Field label={label} help={help} helpLong={def.long} error={error}>
      {def.kind === 'basis' ? (
        <Select
          value={value}
          disabled={missing}
          onChange={onChange}
          options={[
            { value: 'total', label: 'Por puntos históricos' },
            { value: 'available', label: 'Por saldo disponible' },
          ]}
        />

      ) : (
        <input
          className="form-control"
          inputMode={def.kind === 'number' ? 'decimal' : 'text'}
          value={value}
          disabled={missing}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/// Dispara una pasada de vencimiento sin esperar al proceso nocturno.
function ExpirationRunner() {
  const confirm = useConfirm();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<ExpirationResult | null>(null);

  async function run() {
    const ok = await confirm({
      title: '¿Ejecutar el vencimiento ahora?',
      message: 'Se envían los avisos pendientes y se quitan los puntos de los saldos cuya fecha ya pasó. Los puntos vencidos no se pueden devolver desde aquí.',
      tone: 'danger',
      confirmText: 'Ejecutar vencimiento',
      typeToConfirm: 'VENCER',
    });
    if (!ok) return;
    setRunning(true); setResult(null);
    try {
      const r = await rewardsAdminApi.runExpiration();
      setResult(r);
      toast.success(`${fmtPoints(r.warned)} avisos enviados y ${fmtPoints(r.expired)} saldos vencidos.`, 'Vencimiento ejecutado');
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo ejecutar el vencimiento.'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <SectionCard
      className="rw-danger-zone"
      title="Zona de mantenimiento"
      icon="fa-screwdriver-wrench"
      description="Acciones que actúan sobre los saldos de todos los usuarios."
      tourId="rw-set-maint"
    >
      <div className="d-flex flex-wrap align-items-center gap-3">
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="fw-semibold">Ejecutar vencimiento ahora <StatusBadge tone="bad" size="sm">Irreversible</StatusBadge></div>
          <div className="small bugie-muted">
            Corre solo cada noche. Úsalo para probarlo o forzarlo sin esperar.
          </div>
        </div>
        <button type="button" onClick={run} disabled={running} className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-2">
          {running ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="fa-solid fa-play" aria-hidden="true" />}
          {running ? 'Ejecutando…' : 'Ejecutar vencimiento'}
        </button>
      </div>

      {result && (
        <div className="mt-3">
          <StatGrid min={140}>
            <StatCard label="Avisados" value={fmtPoints(result.warned)} icon="fa-bell" tone="info" />
            <StatCard label="Perfiles vencidos" value={fmtPoints(result.expired)} icon="fa-user-clock" tone="warn" />
            <StatCard label="Puntos perdidos" value={fmtPoints(result.pointsLost)} icon="fa-fire-flame-curved" tone="bad" />
          </StatGrid>
        </div>
      )}
    </SectionCard>
  );
}
