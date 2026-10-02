import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';

interface Vehicle {
  id: string; plate: string; brand: string;
  model: string; year: number; color: string;
  isActive: boolean;
  photoUrl?: string | null;
}

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form nuevo vehículo
  const [plate, setPlate]   = useState('');
  const [brand, setBrand]   = useState('');
  const [model, setModel]   = useState('');
  const [year,  setYear]    = useState('');
  const [color, setColor]   = useState('');
  const [saving, setSaving] = useState(false);

  // Upload de foto del vehículo activo
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      // Mi perfil de conductor -> su detalle con los vehiculos
      const me = await apiFetch<{ id: string }>(`${API.drivers}/drivers/me`);
      const detail = await apiFetch<{ vehicles: Vehicle[] }>(
        `${API.drivers}/drivers/${me.id}/detail`
      );
      setVehicles(detail?.vehicles ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los vehículos.');
    } finally { setLoading(false); }
  }

  async function activate(id: string) {
    setActing(id); setError(null); setSuccess(null);
    try {
      await apiFetch(`${API.drivers}/drivers/vehicles/${id}/activate`, { method: 'PUT' });
      setVehicles(prev => prev.map(v => ({ ...v, isActive: v.id === id })));
      setSuccess('Vehículo activado correctamente.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al activar vehículo.');
    } finally { setActing(null); }
  }

  async function addVehicle() {
    if (!plate || !brand || !model || !year || !color) {
      setError('Completa todos los campos.'); return;
    }
    setSaving(true); setError(null); setSuccess(null);
    try {
      await apiFetch(`${API.drivers}/drivers/vehicles`, {
        method: 'POST',
        body: JSON.stringify({
          plate, brand, model,
          year: parseInt(year),
          color,
        }),
      });
      setSuccess('Vehículo agregado y activado.');
      setShowForm(false);
      setPlate(''); setBrand(''); setModel(''); setYear(''); setColor('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al agregar vehículo.');
    } finally { setSaving(false); }
  }

  async function uploadVehiclePhoto(file: File) {
    setError(null); setSuccess(null); setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('file', file);

      const token = localStorage.getItem('bugie_token');
      const res = await fetch(`${API.drivers}/drivers/vehicles/me/photo`, {
        method:  'POST',
        body:    form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo subir la foto.');
      }

      setSuccess('Foto del vehículo actualizada.');
      await load();
    } catch (err: any) {
      setError(err.message ?? 'Error al subir la foto.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  const activeVehicle = vehicles.find(v => v.isActive);

  return (
    <>
      <PageHeader
        title="Mis vehículos"
        subtitle="Gestiona los vehículos registrados en tu cuenta."
        icon="fa-solid fa-car"
      />

      {error   && <div className="alert alert-danger  small mb-3">{error}</div>}
      {success && <div className="alert alert-success small mb-3"><i className="fa-solid fa-check me-2" />{success}</div>}

      {/* Foto del vehículo activo */}
      {activeVehicle && (
        <div className="bugie-card mb-4">
          <div className="bugie-card-header">
            <i className="fa-solid fa-image me-2 text-bugie-accent" />
            Foto del vehículo activo
          </div>
          <div className="bugie-card-body">
            <div className="row g-3 align-items-center">
              <div className="col-12 col-md-5">
                <div style={{
                  borderRadius: 12, overflow: 'hidden',
                  background: 'var(--bugie-bg-2)',
                  aspectRatio: '16/9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--bugie-border)',
                }}>
                  {activeVehicle.photoUrl ? (
                    <img src={activeVehicle.photoUrl} alt="Vehículo"
                         style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="text-center bugie-muted">
                      <i className="fa-solid fa-camera fa-2x mb-2 d-block" />
                      <div className="small">Sin foto subida</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="col-12 col-md-7">
                <div className="small bugie-muted mb-3">
                  <i className="fa-solid fa-circle-info me-1" />
                  Esta foto se mostrará a los pasajeros cuando vean el detalle del viaje en su historial.
                  Usa una foto clara y reciente. Máximo 5 MB. Formatos: JPG, PNG, WEBP.
                </div>
                <label className="btn btn-bugie text-white rounded-pill" style={{ cursor: 'pointer' }}>
                  {uploadingPhoto
                    ? <><span className="spinner-border spinner-border-sm me-2" />Subiendo…</>
                    : <><i className="fa-solid fa-upload me-2" />
                        {activeVehicle.photoUrl ? 'Cambiar foto' : 'Subir foto'}</>}
                  <input type="file" accept="image/*" hidden disabled={uploadingPhoto}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadVehiclePhoto(f);
                      e.target.value = '';
                    }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botón agregar */}
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-bugie text-white rounded-pill"
          onClick={() => setShowForm(v => !v)}>
          <i className={`fa-solid ${showForm ? 'fa-xmark' : 'fa-plus'} me-2`} />
          {showForm ? 'Cancelar' : 'Agregar vehículo'}
        </button>
      </div>

      {/* Formulario nuevo vehículo */}
      {showForm && (
        <div className="bugie-card mb-4">
          <div className="bugie-card-header">
            <i className="fa-solid fa-car me-2 text-bugie-accent" />
            Nuevo vehículo
          </div>
          <div className="bugie-card-body">
            <div className="row g-3">
              {[
                { label: 'Placa',  value: plate, set: setPlate, placeholder: 'ABC-123' },
                { label: 'Marca',  value: brand, set: setBrand, placeholder: 'Toyota'  },
                { label: 'Modelo', value: model, set: setModel, placeholder: 'Corolla' },
                { label: 'Año',    value: year,  set: setYear,  placeholder: '2020'    },
                { label: 'Color',  value: color, set: setColor, placeholder: 'Blanco'  },
              ].map(f => (
                <div className="col-6 col-md-4" key={f.label}>
                  <label className="form-label small bugie-muted">{f.label}</label>
                  <input className="form-control" placeholder={f.placeholder}
                    value={f.value} onChange={e => f.set(e.target.value)} />
                </div>
              ))}
            </div>
            <div className="mt-3 d-flex gap-2">
              <button className="btn btn-success rounded-pill px-4"
                onClick={addVehicle} disabled={saving}>
                {saving
                  ? <span className="spinner-border spinner-border-sm" />
                  : <><i className="fa-solid fa-check me-2" />Guardar vehículo</>}
              </button>
            </div>
            <div className="small bugie-muted mt-2">
              <i className="fa-solid fa-circle-info me-1" />
              Al agregar un vehículo nuevo este se activará automáticamente.
            </div>
          </div>
        </div>
      )}

      {/* Lista de vehículos */}
      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <span className="spinner-border" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
            <i className="fa-solid fa-car" />
          </div>
          <div className="fw-semibold mb-2">Sin vehículos registrados</div>
          <div className="small bugie-muted">Agrega tu primer vehículo para comenzar a recibir viajes.</div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {vehicles.map(v => (
            <div key={v.id} className="bugie-card" style={{ overflow: 'hidden' }}>
              <div style={{ height: 3, background: v.isActive ? '#34d399' : 'var(--bugie-border)' }} />
              <div className="bugie-card-body d-flex align-items-center gap-3">

                <div style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: v.isActive ? '#34d39922' : '#33415522',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className="fa-solid fa-car-side"
                    style={{ color: v.isActive ? '#34d399' : 'var(--bugie-muted)', fontSize: '1.2rem' }} />
                </div>

                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span className="fw-bold">{v.brand} {v.model}</span>
                    {v.isActive && (
                      <span className="badge rounded-pill" style={{ background: '#34d39922', color: '#34d399', fontSize: '0.72rem' }}>
                        <i className="fa-solid fa-circle-dot me-1" style={{ fontSize: '0.6rem' }} />
                        Activo
                      </span>
                    )}
                  </div>
                  <div className="d-flex gap-3 flex-wrap" style={{ fontSize: '0.82rem' }}>
                    <span className="bugie-muted">
                      <i className="fa-solid fa-hashtag me-1" style={{ fontSize: '0.7rem' }} />
                      {v.plate}
                    </span>
                    <span className="bugie-muted">
                      <i className="fa-solid fa-calendar me-1" style={{ fontSize: '0.7rem' }} />
                      {v.year}
                    </span>
                    <span className="bugie-muted">
                      <i className="fa-solid fa-palette me-1" style={{ fontSize: '0.7rem' }} />
                      {v.color}
                    </span>
                  </div>
                </div>

                {!v.isActive && (
                  <button className="btn btn-sm btn-bugie-outline rounded-pill flex-shrink-0"
                    onClick={() => activate(v.id)} disabled={acting === v.id}>
                    {acting === v.id
                      ? <span className="spinner-border spinner-border-sm" />
                      : <><i className="fa-solid fa-circle-check me-1" />Activar</>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}