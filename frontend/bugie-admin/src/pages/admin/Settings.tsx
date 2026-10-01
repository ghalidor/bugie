import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';
import { invalidateMapConfigCache } from '../../hooks/useMapConfig';

interface Setting {
  id: string; settingKey: string; value: string;
  description: string | null; updatedAt: string;
}

const KEY_LABEL: Record<string, string> = {
  platform_fee_rate: 'Comisión de la plataforma (%)',
  base_fare:         'Tarifa base mínima (S/)',
  fare_per_km:       'Tarifa por kilómetro (S/)',
  max_radius_km:     'Radio máximo de búsqueda (km)',
  sos_response_min:  'Tiempo objetivo respuesta SOS (min)',
  support_email:     'Correo de soporte',
  support_phone:     'Teléfono de soporte',
  default_lat:       'Latitud del mapa por defecto',
  default_lng:       'Longitud del mapa por defecto',
  default_zoom:      'Zoom del mapa por defecto',
  default_city:      'Ciudad principal',
  deviation_detection_enabled: 'Detección de desvío de ruta (true/false)',
};

function SettingField({ k, values, settings, saving, saved, setValues, onSave }: {
  k: string;
  values: Record<string, string>;
  settings: Setting[];
  saving: string | null;
  saved: string | null;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (key: string) => void;
}) {
  const desc = settings.find(s => s.settingKey === k)?.description;
  return (
    <div className="mb-3">
      <label className="form-label small fw-semibold">
        {KEY_LABEL[k] ?? k}
        {desc && <span className="fw-normal bugie-muted ms-2">— {desc}</span>}
      </label>
      <div className="input-group input-group-sm">
        <input
          className="form-control"
          value={values[k] ?? ''}
          onChange={e => setValues(p => ({ ...p, [k]: e.target.value }))}
        />
        <button
          className="btn text-white"
          style={{ background: saved === k ? '#34d399' : 'var(--bugie-primary)', border: 'none', minWidth: 90, flexShrink: 0 }}
          onClick={() => onSave(k)}
          disabled={saving === k}
        >
          {saving === k
            ? <span className="spinner-border spinner-border-sm" />
            : saved === k
            ? <><i className="fa-solid fa-check me-1" />Guardado</>
            : 'Guardar'
          }
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [values,   setValues]   = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [saved,    setSaved]    = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Setting[]>(`${API.landing}/landing/settings`)
      .then(data => {
        setSettings(data);
        const vals: Record<string, string> = {};
        data.forEach(s => { vals[s.settingKey] = s.value; });
        setValues(vals);
      })
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo conectar con Landing.Api.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string) {
    setSaving(key); setError(null); setSaved(null);
    try {
      await apiFetch(`${API.landing}/landing/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: values[key] }),
      });
      if (key === 'default_lat' || key === 'default_lng' || key === 'default_zoom') {
        invalidateMapConfigCache();
      }
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(`Error al guardar ${KEY_LABEL[key] ?? key}.`);
    } finally { setSaving(null); }
  }

  const fieldProps = { values, settings, saving, saved, setValues, onSave: save };

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Parámetros operativos de la plataforma Bugie."
        icon="fa-solid fa-gear"
      />

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <span className="spinner-border" />
        </div>
      ) : (
        <div className="row g-3">

          {/* Columna izquierda */}
          <div className="col-12 col-lg-6">

            {/* Tarifas */}
            <div className="bugie-card mb-3">
              <div className="bugie-card-header">
                <i className="fa-solid fa-money-bill-wave me-2" style={{ color: '#34d399' }} />
                Tarifas y comisiones
              </div>
              <div className="bugie-card-body">
                {['platform_fee_rate','base_fare','fare_per_km','max_radius_km','sos_response_min']
                  .filter(k => values[k] !== undefined)
                  .map(k => <SettingField key={k} k={k} {...fieldProps} />)}
              </div>
            </div>

            {/* Ubicación y mapa */}
            <div className="bugie-card">
              <div className="bugie-card-header">
                <i className="fa-solid fa-map-location-dot me-2" style={{ color: '#818cf8' }} />
                Ubicación por defecto del mapa
              </div>
              <div className="bugie-card-body">
                <div className="small bugie-muted mb-3">
                  <i className="fa-solid fa-circle-info me-1" />
                  Punto inicial de los mapas y nombre de la ciudad usado en correos y otros textos.
                </div>
                {['default_city','default_lat','default_lng','default_zoom']
                  .filter(k => values[k] !== undefined)
                  .map(k => <SettingField key={k} k={k} {...fieldProps} />)}
              </div>
            </div>
          </div>

          {/* Columna derecha */}
          <div className="col-12 col-lg-6">

            {/* Soporte */}
            <div className="bugie-card mb-3">
              <div className="bugie-card-header">
                <i className="fa-solid fa-headset me-2" style={{ color: '#38bdf8' }} />
                Contacto y soporte
              </div>
              <div className="bugie-card-body">
                {['support_email','support_phone']
                  .filter(k => values[k] !== undefined)
                  .map(k => <SettingField key={k} k={k} {...fieldProps} />)}
              </div>
            </div>
          </div>

        </div>
      )}
    </>
  );
}