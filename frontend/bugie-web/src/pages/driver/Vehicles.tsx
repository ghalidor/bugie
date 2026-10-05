import { useEffect, useState } from 'react';
import { apiFetch, API, ApiError, driversFileUrl } from '../../state/api';
import { getToken } from '../../state/session';
import { Drawer, EmptyState, Field, FormGrid, Notice, Page, SectionCard, Skeleton, StatusBadge, useToast } from '../../components/ui';

interface Vehicle {
  id: string; plate: string; brand: string;
  model: string; year: number; color: string;
  isActive: boolean;
  photoUrl?: string | null;
}

type PhotoType = 'front' | 'side' | 'plate';

interface VehiclePhoto { type: PhotoType; url: string; updatedAt: string; }

// Las tres fotos del vehículo (obligatorias al registrarlo).
const PHOTO_TYPES: Array<{ type: PhotoType; label: string; help: string }> = [
  { type: 'front', label: 'Frente',  help: 'El auto de frente, completo.' },
  { type: 'side',  label: 'Costado', help: 'El auto de lado, completo.' },
  { type: 'plate', label: 'Placa',   help: 'La placa, que se lea bien.' },
];

/** 'full' para el último campo de una lista impar (grilla de 2 columnas). */
const lastOdd = (i: number, total: number) => (i === total - 1 && total % 2 === 1 ? 'full' as const : undefined);

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

// Envía un multipart con el token (sin Content-Type: el navegador pone el boundary).
async function postForm<T>(url: string, form: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as any).error ?? `Error ${res.status}`);
  return body as T;
}

function checkPhoto(file: File): string | null {
  if (!PHOTO_ACCEPT.split(',').includes(file.type)) return 'La foto debe ser JPG, PNG o WEBP.';
  if (file.size > MAX_PHOTO_BYTES) return 'La foto no puede pesar más de 5 MB.';
  return null;
}

export default function Vehicles() {
  const toast = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form nuevo vehículo
  const [plate, setPlate]   = useState('');
  const [brand, setBrand]   = useState('');
  const [model, setModel]   = useState('');
  const [year,  setYear]    = useState('');
  const [color, setColor]   = useState('');
  const [newPhotos, setNewPhotos] = useState<Partial<Record<PhotoType, File>>>({});
  const [saving, setSaving] = useState(false);

  // Fotos del vehículo activo
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [uploadingType, setUploadingType] = useState<PhotoType | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      // Mi perfil de conductor -> su detalle con los vehiculos
      const me = await apiFetch<{ id: string }>(`${API.drivers}/drivers/me`);
      const detail = await apiFetch<{ vehicles: Vehicle[] }>(
        `${API.drivers}/drivers/${me.id}/detail`
      );
      const list = detail?.vehicles ?? [];
      setVehicles(list);
      const active = list.find(v => v.isActive);
      if (active) await loadPhotos(active.id);
      else setPhotos([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los vehículos.');
    } finally { setLoading(false); }
  }

  async function loadPhotos(vehicleId: string) {
    try {
      const list = await apiFetch<VehiclePhoto[]>(`${API.drivers}/drivers/vehicles/${vehicleId}/photos`);
      setPhotos(list ?? []);
    } catch {
      setPhotos([]);
    }
  }

  async function activate(id: string) {
    setActing(id); setError(null);
    try {
      await apiFetch(`${API.drivers}/drivers/vehicles/${id}/activate`, { method: 'PUT' });
      setVehicles(prev => prev.map(v => ({ ...v, isActive: v.id === id })));
      await loadPhotos(id);
      toast.success('Vehículo activado correctamente.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al activar vehículo.');
    } finally { setActing(null); }
  }

  function resetForm() {
    setPlate(''); setBrand(''); setModel(''); setYear(''); setColor('');
    setNewPhotos({});
    setFormError(null);
  }

  function pickNewPhoto(type: PhotoType, file: File | undefined) {
    if (!file) return;
    const problem = checkPhoto(file);
    if (problem) { setFormError(problem); return; }
    setFormError(null);
    setNewPhotos(prev => ({ ...prev, [type]: file }));
  }

  async function addVehicle(e?: React.FormEvent) {
    e?.preventDefault();
    if (!plate || !brand || !model || !year || !color) {
      setFormError('Completa todos los campos.'); return;
    }
    const missing = PHOTO_TYPES.filter(p => !newPhotos[p.type]).map(p => p.label.toLowerCase());
    if (missing.length > 0) {
      setFormError(`Faltan las fotos: ${missing.join(', ')}.`); return;
    }
    setSaving(true); setFormError(null);
    try {
      const form = new FormData();
      form.append('plate', plate);
      form.append('brand', brand);
      form.append('model', model);
      form.append('year', String(parseInt(year)));
      form.append('color', color);
      form.append('photoFront', newPhotos.front!);
      form.append('photoSide',  newPhotos.side!);
      form.append('photoPlate', newPhotos.plate!);
      await postForm(`${API.drivers}/drivers/vehicles/with-photos`, form);
      toast.success('Vehículo agregado y activado.');
      setShowForm(false);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al agregar vehículo.');
    } finally { setSaving(false); }
  }

  async function replacePhoto(vehicle: Vehicle, type: PhotoType, file: File) {
    const problem = checkPhoto(file);
    if (problem) { setError(problem); return; }
    setError(null); setUploadingType(type);
    try {
      const form = new FormData();
      form.append('file', file);
      await postForm(`${API.drivers}/drivers/vehicles/${vehicle.id}/photos/${type}`, form);
      toast.success('Foto del vehículo actualizada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la foto.');
    } finally {
      setUploadingType(null);
    }
  }

  const activeVehicle = vehicles.find(v => v.isActive);

  // URL de cada foto del vehículo activo. Si no hay registro de "frente"
  // (vehículos antiguos), se usa photoUrl.
  function photoUrlOf(type: PhotoType): string {
    const found = photos.find(p => p.type === type)?.url;
    if (found) return driversFileUrl(found);
    if (type === 'front') return driversFileUrl(activeVehicle?.photoUrl);
    return '';
  }

  const fields = [
    { label: 'Placa',  value: plate, set: setPlate, placeholder: 'ABC-123', mode: 'text' as const },
    { label: 'Marca',  value: brand, set: setBrand, placeholder: 'Toyota',  mode: 'text' as const },
    { label: 'Modelo', value: model, set: setModel, placeholder: 'Corolla', mode: 'text' as const },
    { label: 'Año',    value: year,  set: setYear,  placeholder: '2020',    mode: 'numeric' as const },
    { label: 'Color',  value: color, set: setColor, placeholder: 'Blanco',  mode: 'text' as const },
  ];

  const photoGrid = { display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' } as const;

  return (
    <Page
      title="Mis vehículos"
      subtitle="Los vehículos registrados en tu cuenta. Solo uno puede estar activo."
      icon="fa-car"
      actions={[{ label: 'Agregar vehículo', icon: 'fa-plus', variant: 'primary', onClick: () => { resetForm(); setShowForm(true); } }]}
    >
      {error && <Notice tone="bad">{error}</Notice>}

      {/* Fotos del vehículo activo */}
      {activeVehicle && (
        <SectionCard title="Fotos del vehículo activo" icon="fa-image"
                     description="Frente, costado y placa. Los pasajeros ven la foto de frente en el detalle del viaje.">
          <div className="fw-bold mb-2">{activeVehicle.brand} {activeVehicle.model} · {activeVehicle.plate}</div>
          <div style={photoGrid}>
            {PHOTO_TYPES.map(p => {
              const src = photoUrlOf(p.type);
              const busy = uploadingType === p.type;
              return (
                <div key={p.type} className="bx-stack-sm">
                  <div className="small fw-semibold">{p.label}</div>
                  <div className="bx-media">
                    {src
                      ? <img src={src} alt={`${p.label} de ${activeVehicle.brand} ${activeVehicle.model}`} />
                      : <div className="text-center"><i className="fa-solid fa-camera fa-2x d-block mb-2" aria-hidden="true" /><span className="small">Sin foto</span></div>}
                  </div>
                  <label className={`btn btn-sm ${src ? 'btn-bugie-outline' : 'btn-bugie'} ${uploadingType ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
                    {busy
                      ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Subiendo…</>
                      : <><i className={`fa-solid ${src ? 'fa-rotate' : 'fa-upload'}`} aria-hidden="true" />{src ? 'Reemplazar' : 'Subir foto'}</>}
                    <input type="file" accept={PHOTO_ACCEPT} hidden disabled={!!uploadingType}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) replacePhoto(activeVehicle, p.type, f);
                        e.target.value = '';
                      }} />
                  </label>
                </div>
              );
            })}
          </div>
          <p className="small bx-muted mb-0 mt-2">Usa fotos claras y recientes. Máximo 5 MB · JPG, PNG o WEBP.</p>
        </SectionCard>
      )}

      {/* Lista de vehículos */}
      {loading ? (
        <div className="bx-rows">{[0, 1].map(i => <Skeleton key={i} height={76} radius={14} />)}</div>
      ) : vehicles.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon="fa-car"
            title="Sin vehículos registrados"
            text="Agrega tu primer vehículo para comenzar a recibir viajes."
            action={<button type="button" className="btn btn-bugie" onClick={() => { resetForm(); setShowForm(true); }}><i className="fa-solid fa-plus" aria-hidden="true" />Agregar vehículo</button>}
          />
        </SectionCard>
      ) : (
        <div className="bx-rows">
          {vehicles.map(v => (
            <div key={v.id} className="bx-row">
              <span className={`bx-list-icon bx-tone-${v.isActive ? 'ok' : 'neutral'}`} aria-hidden="true">
                <i className="fa-solid fa-car-side" />
              </span>
              <div className="bx-list-text">
                <div className="bx-list-title">
                  {v.brand} {v.model}
                  {v.isActive && <StatusBadge tone="ok" dot size="sm">Activo</StatusBadge>}
                </div>
                <div className="bx-list-sub d-flex gap-3 flex-wrap">
                  <span><i className="fa-solid fa-hashtag me-1" aria-hidden="true" />{v.plate}</span>
                  <span><i className="fa-solid fa-calendar me-1" aria-hidden="true" />{v.year}</span>
                  <span><i className="fa-solid fa-palette me-1" aria-hidden="true" />{v.color}</span>
                </div>
              </div>
              {!v.isActive && (
                <div className="bx-list-end">
                  <button className="btn btn-sm btn-bugie-outline" onClick={() => activate(v.id)} disabled={acting === v.id}>
                    {acting === v.id
                      ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                      : <i className="fa-solid fa-circle-check" aria-hidden="true" />}
                    Activar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Nuevo vehículo */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        dirty="auto"

        title="Nuevo vehículo"
        description="Al agregarlo se activará automáticamente. Las tres fotos son obligatorias."
        footer={
          <>
            <button type="button" className="btn btn-bugie-outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button>
            <button type="submit" form="new-vehicle" className="btn btn-bugie" disabled={saving}>
              {saving
                ? <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                : <i className="fa-solid fa-check" aria-hidden="true" />}
              Guardar vehículo
            </button>
          </>
        }
      >
        <form id="new-vehicle" className="bx-form" onSubmit={addVehicle} noValidate>
          {formError && <Notice tone="bad">{formError}</Notice>}
          {/* En filas de 2: si el total es impar, el último ocupa todo el ancho (sin huecos). */}
          <FormGrid>
            {fields.map((f, i) => (
              <Field key={f.label} label={f.label} required span={lastOdd(i, fields.length)}>
                <input className="form-control" placeholder={f.placeholder} inputMode={f.mode}
                       value={f.value} onChange={e => f.set(e.target.value)} />
              </Field>
            ))}
          </FormGrid>
          <FormGrid>
            {PHOTO_TYPES.map((p, i) => (
              <Field key={p.type} label={`Foto: ${p.label}`} required span={lastOdd(i, PHOTO_TYPES.length)}
                     help={newPhotos[p.type] ? newPhotos[p.type]!.name : p.help}>
                <input type="file" className="form-control" accept={PHOTO_ACCEPT}
                       onChange={e => pickNewPhoto(p.type, e.target.files?.[0])} />
              </Field>
            ))}
          </FormGrid>
        </form>
      </Drawer>
    </Page>
  );
}
