import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import { rewardsAdminApi, RewardSetting, ExpirationResult, fmtPoints } from '../../../state/rewards';

type Kind = 'bool' | 'number' | 'text' | 'basis';

interface FieldDef {
  key:   string;
  label: string;
  help:  string;
  kind:  Kind;
}

/// Grupos de configuracion. Las claves son exactamente las de rewards.settings.
const GROUPS: { title: string; icon: string; color: string; fields: FieldDef[] }[] = [
  {
    title: 'Acumulación', icon: 'fa-solid fa-coins', color: 'var(--bugie-ok)',
    fields: [
      { key: 'points_enabled',        kind: 'bool',   label: 'Motor de puntos activo',
        help: 'Si lo apagas, los viajes dejan de sumar puntos. Nada más se ve afectado.' },
      { key: 'points_rate_passenger', kind: 'number', label: 'Puntos por S/ 1 — pasajero',
        help: 'Ejemplo: con 10, un viaje de S/ 15 da 150 puntos. Usa punto decimal.' },
      { key: 'points_rate_driver',    kind: 'number', label: 'Puntos por S/ 1 — conductor',
        help: 'Ejemplo: con 5, un viaje de S/ 15 da 75 puntos.' },
      { key: 'points_level_basis',    kind: 'basis',  label: 'Cómo se calcula el nivel',
        help: 'Histórico: el nivel nunca baja. Saldo: baja si el usuario canjea o le vencen puntos.' },
    ],
  },
  {
    title: 'Canje', icon: 'fa-solid fa-gift', color: 'var(--bugie-primary-soft)',
    fields: [
      { key: 'redemption_enabled', kind: 'bool', label: 'Canje activo',
        help: 'Si lo apagas, nadie puede canjear, pero se siguen acumulando puntos.' },
    ],
  },
  {
    title: 'Promociones', icon: 'fa-solid fa-bullhorn', color: 'var(--bugie-primary-soft)',
    fields: [
      { key: 'promotions_enabled',    kind: 'bool',   label: 'Promociones activas',
        help: 'Interruptor general. Apagado, ninguna promoción suma puntos aunque esté activa.' },
      { key: 'timezone_offset_hours', kind: 'number', label: 'Zona horaria (horas respecto a UTC)',
        help: 'Perú es -5. Define a qué hora real corresponden los días y las franjas horarias.' },
    ],
  },
  {
    title: 'Cupones sobre la tarifa', icon: 'fa-solid fa-tag', color: 'var(--bugie-bad)',
    fields: [
      { key: 'coupons_apply_to_fare', kind: 'bool',
        label: '¿Los cupones descuentan del precio del viaje?',
        help: 'Apagado (lo normal por ahora): los cupones se canjean y se guardan, pero al pedir un viaje no descuentan nada. Encendido: el pasajero puede aplicar uno de sus cupones a un viaje aceptado y paga menos.' },
      { key: 'coupon_max_is_commission', kind: 'bool',
        label: 'Limitar el descuento a tu comisión',
        help: 'El pasajero le paga al conductor EN PERSONA, así que un descuento le quita dinero a él. Con esto encendido el descuento nunca pasa de tu comisión: el conductor cobra siempre lo mismo y la rebaja sale de lo que tú ganas. Apagarlo aplica el descuento completo, pero el conductor cobra de menos y queda registrado cuánto le debes, sin forma de pagárselo todavía.' },
    ],
  },
  {
    title: 'Logros personales', icon: 'fa-solid fa-fire', color: 'var(--bugie-warn)',
    fields: [
      { key: 'streak_days',   kind: 'number', label: 'Días seguidos para la racha',
        help: 'Se vuelve a pagar en cada bloque: a los 7, 14, 21 días. Con 0 se desactiva.' },
      { key: 'streak_points', kind: 'number', label: 'Puntos al completar la racha',
        help: 'Se acreditan el día que se cierra el bloque.' },
      { key: 'weekly_goal_trips_passenger', kind: 'number', label: 'Meta semanal — pasajero',
        help: 'Viajes a la semana. Viene en 0 porque 50 es cifra de conductor, no de pasajero.' },
      { key: 'weekly_goal_trips_driver',    kind: 'number', label: 'Meta semanal — conductor',
        help: 'Servicios a la semana para ganar el bono.' },
      { key: 'weekly_goal_points',          kind: 'number', label: 'Puntos al cumplir la meta',
        help: 'Una vez por semana, aunque siga viajando.' },
      { key: 'anniversary_multiplier',      kind: 'number', label: 'Multiplicador del mes de aniversario',
        help: 'Durante el mes en que se registró. Con 1 se desactiva. No aplica el primer año.' },
      { key: 'no_cancel_min_trips', kind: 'number', label: 'Bono sin cancelar — viajes mínimos del día',
        help: 'Viajes que el conductor debe completar ese día para optar al bono. El mínimo existe para que premie trabajar bien y no simplemente no trabajar: sin él, quien se queda en casa tiene cero cancelaciones y cobraría todos los días. Con 0 se desactiva la regla.' },
      { key: 'no_cancel_points',    kind: 'number', label: 'Bono sin cancelar — puntos',
        help: 'Se paga de madrugada, mirando el día anterior. Solo cuentan las cancelaciones del conductor: si el pasajero se arrepiente, él no pierde el bono.' },
    ],
  },
  {
    title: 'Calificaciones', icon: 'fa-solid fa-star', color: 'var(--bugie-warn)',
    fields: [
      { key: 'rating_points_passenger', kind: 'number', label: 'Puntos al pasajero por calificar',
        help: 'Premia que se tome el trabajo de calificar.' },
      { key: 'rating_points_driver',    kind: 'number', label: 'Puntos al conductor por recibir 5 estrellas',
        help: 'Solo con 5. Acá el incentivo sí es el correcto.' },
      { key: 'rating_require_five_stars', kind: 'bool', label: '¿Pagar al pasajero solo con 5 estrellas?',
        help: 'Activado es lo que pide el PDF, pero sesga las notas: todos pondrían 5. Desactivado, cobra por calificar sin importar la nota y las calificaciones vuelven a ser útiles.' },
    ],
  },
  {
    title: 'Referidos', icon: 'fa-solid fa-user-plus', color: 'var(--bugie-primary-soft)',
    fields: [
      { key: 'referrals_enabled',         kind: 'bool',   label: 'Referidos activos',
        help: 'Apagado, el código deja de dar puntos. Los ya acreditados no se tocan.' },
      { key: 'referral_points_passenger', kind: 'number', label: 'Puntos por referir un pasajero',
        help: 'Se acreditan cuando el invitado crea su cuenta con el código.' },
      { key: 'referral_points_driver',    kind: 'number', label: 'Puntos por referir un conductor',
        help: 'Suele ser menor que el de pasajero: hay menos conductores pero valen más.' },
      { key: 'referral_qualify_trips',    kind: 'number', label: 'Viajes que debe completar el invitado',
        help: 'Para el bono extra. Con 0 se desactiva ese bono.' },
      { key: 'referral_qualify_points',   kind: 'number', label: 'Bono extra al completarlos',
        help: 'Premia que el invitado se quede, no solo que se registre.' },
    ],
  },
  {
    title: 'Sorteos', icon: 'fa-solid fa-dice', color: 'var(--bugie-ok)',
    fields: [
      { key: 'raffles_enabled',          kind: 'bool',   label: 'Sorteos activos',
        help: 'Apagado, no se reparten tickets ni se ejecutan sorteos.' },
      { key: 'raffle_points_per_ticket', kind: 'number', label: 'Puntos del mes por ticket extra',
        help: 'Un ticket adicional por cada N puntos ganados en el mes. Con 0 se desactiva.' },
    ],
  },
  {
    title: 'Vencimiento', icon: 'fa-solid fa-hourglass-half', color: 'var(--bugie-warn)',
    fields: [
      { key: 'points_expiry_enabled',          kind: 'bool',   label: 'Vencimiento activo',
        help: 'Si lo apagas, los puntos no vencen y no se envían avisos.' },
      { key: 'points_expiry_months_passenger', kind: 'number', label: 'Vigencia en meses — pasajero',
        help: 'Cada viaje completado renueva este plazo para todo el saldo.' },
      { key: 'points_expiry_months_driver',    kind: 'number', label: 'Vigencia en meses — conductor',
        help: 'Cada servicio completado renueva este plazo para todo el saldo.' },
      { key: 'points_expiry_warning_days',     kind: 'text',   label: 'Avisos push antes de vencer (días)',
        help: 'Separados por coma. "30,7,1" avisa a los 30 días, a los 7 y el último día. "30" da un solo aviso.' },
    ],
  },
];

export default function SettingsTab() {
  const [values,  setValues]  = useState<Record<string, string>>({});
  const [loaded,  setLoaded]  = useState<RewardSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);
  const [saved,   setSaved]   = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    rewardsAdminApi.settings()
      .then(data => {
        setLoaded(data);
        const v: Record<string, string> = {};
        data.forEach(s => { v[s.settingKey] = s.value; });
        setValues(v);
      })
      .catch(err => setError(err instanceof ApiError
        ? err.message
        : 'No se pudo conectar con Rewards.Api (puerto 5006).'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string) {
    setSaving(key); setError(null); setSaved(null);
    try {
      await rewardsAdminApi.saveSetting(key, values[key] ?? '');
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      // El backend devuelve el motivo exacto, por ejemplo "use punto decimal".
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }

  // Si la carga fallo, mostramos solo el error. Dibujar el formulario vacio
  // haria creer que faltan claves en la base, y no es el problema.
  if (error && loaded.length === 0) {
    return <div className="alert alert-danger small">{error}</div>;
  }

  // Claves que existen en la base pero no estan en los grupos (por si se agregan nuevas).
  const known = new Set(GROUPS.flatMap(g => g.fields.map(f => f.key)));
  const extra = loaded.filter(s => !known.has(s.settingKey));

  return (
    <>
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      <div className="row g-3">
        {GROUPS.map(group => (
          <div key={group.title} className="col-12 col-xl-6">
            <div className="bugie-card h-100">
              <div className="bugie-card-header">
                <i className={`${group.icon} me-2`} style={{ color: group.color }} />
                {group.title}
              </div>
              <div className="bugie-card-body">
                {group.fields.map(f => (
                  <Field
                    key={f.key} def={f}
                    value={values[f.key] ?? ''}
                    missing={!(f.key in values)}
                    saving={saving === f.key}
                    saved={saved === f.key}
                    onChange={v => setValues(p => ({ ...p, [f.key]: v }))}
                    onSave={() => save(f.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="col-12 col-xl-6">
          <ExpirationRunner />
        </div>
      </div>

      {extra.length > 0 && (
        <div className="small bugie-muted mt-3">
          Otras claves en la base: {extra.map(s => `${s.settingKey}=${s.value}`).join(', ')}
        </div>
      )}
    </>
  );
}

function Field({ def, value, missing, saving, saved, onChange, onSave }: {
  def: FieldDef; value: string; missing: boolean; saving: boolean; saved: boolean;
  onChange: (v: string) => void; onSave: () => void;
}) {
  const id = `setting-${def.key}`;

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label small fw-semibold mb-1">{def.label}</label>
      <div className="input-group input-group-sm">
        {def.kind === 'bool' ? (
          <select id={id} className="form-select" value={value} onChange={e => onChange(e.target.value)}>
            <option value="true">Activado</option>
            <option value="false">Desactivado</option>
          </select>
        ) : def.kind === 'basis' ? (
          <select id={id} className="form-select" value={value} onChange={e => onChange(e.target.value)}>
            <option value="total">Por puntos históricos</option>
            <option value="available">Por saldo disponible</option>
          </select>
        ) : (
          <input
            id={id}
            className="form-control"
            inputMode={def.kind === 'number' ? 'decimal' : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        )}
        <button
          type="button"
          className="btn text-white"
          style={{ background: saved ? 'var(--bugie-ok)' : 'var(--bugie-primary)', border: 'none', minWidth: 96, flexShrink: 0 }}
          onClick={onSave}
          disabled={saving}
        >
          {saving
            ? <span className="spinner-border spinner-border-sm" />
            : saved
            ? <><i className="fa-solid fa-check me-1" />Guardado</>
            : 'Guardar'}
        </button>
      </div>
      <div className="small bugie-muted mt-1">
        {missing
          ? <span style={{ color: 'var(--bugie-warn)' }}>Esta clave no existe en la base. Revisa que corriste los scripts SQL.</span>
          : def.help}
      </div>
    </div>
  );
}

/// Dispara una pasada de vencimiento sin esperar al proceso nocturno.
function ExpirationRunner() {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<ExpirationResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function run() {
    setRunning(true); setError(null); setResult(null);
    try {
      setResult(await rewardsAdminApi.runExpiration());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ejecutar el vencimiento.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bugie-card h-100">
      <div className="bugie-card-header">
        <i className="fa-solid fa-play me-2" style={{ color: 'var(--bugie-bad)' }} />
        Ejecutar vencimiento ahora
      </div>
      <div className="bugie-card-body">
        <div className="small bugie-muted mb-3">
          El proceso corre solo cada noche. Usa este botón para probarlo o para forzarlo:
          envía los avisos pendientes y vence los saldos cuya fecha ya pasó.
        </div>

        <button type="button" onClick={run} disabled={running} className="btn btn-bugie rounded-pill">
          {running
            ? <><span className="spinner-border spinner-border-sm me-2" />Ejecutando...</>
            : 'Ejecutar ahora'}
        </button>

        {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}

        {result && (
          <div className="row g-2 mt-2">
            {[
              ['Avisados',         result.warned],
              ['Perfiles vencidos', result.expired],
              ['Puntos perdidos',  result.pointsLost],
            ].map(([label, n]) => (
              <div key={label as string} className="col-4">
                <div className="bugie-kpi text-center" style={{ minHeight: 'auto', padding: '0.7rem' }}>
                  <div className="label">{label}</div>
                  <div className="value">{fmtPoints(n as number)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
