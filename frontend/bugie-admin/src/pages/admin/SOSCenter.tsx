import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMapAdmin';
import { apiFetch, API, ApiError } from '../../state/api';

interface SosAlert {
  id: string; tripId: string; userId: string;
  userRole: string; lat: number; lng: number;
  resolved: boolean; createdAt: string;
}

export default function SOSCenter() {
  const [alerts,   setAlerts]   = useState<SosAlert[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<SosAlert | null>(null);

  /// SOS que el admin está por desactivar. Misma UX que el modal de LiveMap:
  /// pide motivo obligatorio (mínimo 3 caracteres) antes de enviar al backend.
  const [sosToResolve,  setSosToResolve]  = useState<SosAlert | null>(null);
  const [resolveReason, setResolveReason] = useState('');
  const [resolving,     setResolving]     = useState(false);

  useEffect(() => {
    const load = () => {
      apiFetch<SosAlert[]>(`${API.trips}/sos`)
        .then(data => {
          setAlerts(data);
          if (data.length > 0 && !selected) setSelected(data[0]);
          setError(null);
        })
        .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo conectar con Trips.Api (localhost:5002).'))
        .finally(() => setLoading(false));
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /// Resuelve la alerta seleccionada. Llama al endpoint con motivo en el body.
  /// Si falla, no removemos de la lista (el usuario sigue viendo la alerta).
  async function handleResolveSos() {
    if (!sosToResolve) return;
    const reason = resolveReason.trim();
    if (reason.length < 3) {
      alert('Por favor escribe un motivo de al menos 3 caracteres.');
      return;
    }
    setResolving(true);
    try {
      await apiFetch(
        `${API.trips}/sos/${sosToResolve.id}/resolve`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }
      );
      // Sacar de la lista local sin esperar el próximo poll.
      setAlerts(prev => prev.filter(a => a.id !== sosToResolve.id));
      if (selected?.id === sosToResolve.id) setSelected(null);
      setSosToResolve(null);
      setResolveReason('');
    } catch (err: any) {
      alert(`No se pudo desactivar la alerta: ${err?.message ?? 'error desconocido'}`);
    } finally {
      setResolving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Centro SOS"
        subtitle={`${alerts.length} alerta${alerts.length !== 1 ? 's' : ''} activa${alerts.length !== 1 ? 's' : ''}. Se actualiza cada 15 segundos.`}
        icon="fa-solid fa-shield-halved"
      />

      {error && (
        <div className="alert alert-warning small mb-3">
          <i className="fa-solid fa-triangle-exclamation me-2" />{error}
        </div>
      )}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : alerts.length === 0 ? (
        <div className="bugie-card p-4 text-center">
          <div className="bugie-mini-icon mx-auto mb-3">
            <i className="fa-solid fa-check text-success" />
          </div>
          <div className="fw-semibold mb-1">Sin alertas activas</div>
          <div className="small bugie-muted">Todo tranquilo. El sistema actualiza automáticamente.</div>
        </div>
      ) : (
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="d-flex flex-column gap-2">
              {alerts.map(a => (
                <div key={a.id}
                  className={`bugie-card ${selected?.id === a.id ? 'border-danger' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(a)}
                >
                  <div className="bugie-card-header d-flex justify-content-between align-items-center">
                    <span className="text-danger fw-bold">
                      <i className="fa-solid fa-triangle-exclamation me-2" />SOS Activo
                    </span>
                    <span className="badge text-bg-danger rounded-pill">Urgente</span>
                  </div>
                  <div className="bugie-card-body">
                    <div className="small mb-1">
                      <span className="bugie-muted">Rol:</span>{' '}
                      <strong>{a.userRole === 'passenger' ? 'Pasajero' : 'Conductor'}</strong>
                    </div>
                    <div className="small mb-1">
                      <span className="bugie-muted">Hora:</span>{' '}
                      {new Date(a.createdAt).toLocaleTimeString('es-PE')}
                    </div>
                    <div className="small mb-3">
                      <span className="bugie-muted">Coordenadas:</span>{' '}
                      {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                    </div>
                    <button className="btn btn-success btn-sm rounded-pill w-100"
                      onClick={e => {
                        e.stopPropagation();
                        setSosToResolve(a);
                        setResolveReason('');
                      }}>
                      <i className="fa-solid fa-check me-2" />Marcar resuelto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-lg-7">
            <div className="bugie-card">
              <div className="bugie-card-header">
                {selected ? 'Ubicación de la alerta' : 'Selecciona una alerta'}
              </div>
              <div className="bugie-card-body p-0">
                <BugieMap
                  height={420}
                  center={selected ? { lat: selected.lat, lng: selected.lng } : undefined}
                  zoom={selected ? 15 : undefined}
                  markers={selected ? [{
                    lat: selected.lat, lng: selected.lng,
                    label: 'Alerta SOS', type: 'destination' as const
                  }] : []}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para pedir motivo de desactivación.
          Mismo diseño que el modal del LiveMap, para que el admin tenga
          una experiencia consistente sin importar desde dónde resuelve. */}
      {sosToResolve && (
        <div
          className="modal show d-block"
          tabIndex={-1}
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={e => {
            if (e.target === e.currentTarget && !resolving) {
              setSosToResolve(null);
              setResolveReason('');
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{
              background: 'var(--bugie-bg-2)',
              border: '2px solid #f87171',
            }}>
              <div className="modal-header" style={{
                borderBottom: '1px solid var(--bugie-border)',
                background: 'rgba(248,113,113,0.1)',
              }}>
                <h5 className="modal-title" style={{ color: '#f87171', fontWeight: 700 }}>
                  <i className="fa-solid fa-circle-exclamation me-2" />
                  Desactivar alerta SOS
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => { if (!resolving) { setSosToResolve(null); setResolveReason(''); } }}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <div className="small bugie-muted mb-1">Emergencia de</div>
                  <div className="fw-bold" style={{ color: 'var(--bugie-text, #e6e8f0)' }}>
                    {sosToResolve.userRole === 'passenger' ? 'Pasajero' : 'Conductor'}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="small bugie-muted mb-1">Reportado el</div>
                  <div style={{ color: 'var(--bugie-text, #e6e8f0)' }}>
                    {new Date(sosToResolve.createdAt).toLocaleString('es-PE')}
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold" style={{ color: 'var(--bugie-text, #e6e8f0)' }}>
                    Motivo de desactivación <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ej: Falsa alarma confirmada por teléfono. Pasajero llegó bien."
                    value={resolveReason}
                    onChange={e => setResolveReason(e.target.value)}
                    maxLength={500}
                    disabled={resolving}
                    autoFocus
                  />
                  <div className="small bugie-muted mt-1">
                    Mínimo 3 caracteres. {resolveReason.length}/500
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bugie-border)' }}>
                <button
                  className="btn btn-bugie-outline"
                  onClick={() => { setSosToResolve(null); setResolveReason(''); }}
                  disabled={resolving}
                >
                  Cancelar
                </button>
                <button
                  className="btn"
                  style={{ background: '#f87171', color: 'white', fontWeight: 600 }}
                  onClick={handleResolveSos}
                  disabled={resolving || resolveReason.trim().length < 3}
                >
                  {resolving
                    ? (<><i className="fa-solid fa-spinner fa-spin me-1" />Desactivando...</>)
                    : (<><i className="fa-solid fa-circle-check me-1" />Desactivar alerta</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
