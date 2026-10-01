import { useDefaultLocation } from '../../hooks/useDefaultLocation';
import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMap';
import { API, apiFetch, ApiError } from '../../state/api';

interface DriverProfile {
  id: string; status: number; isOnline: boolean;
  currentLat: number | null; currentLng: number | null;
}

type GpsState = 'idle' | 'requesting' | 'ok' | 'denied' | 'error';

export default function DriverGoOnline() {
  const defaultLoc = useDefaultLocation();
  const [profile,   setProfile]   = useState<DriverProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [gpsState,  setGpsState]  = useState<GpsState>('idle');
  const [myPos,     setMyPos]     = useState<{ lat: number; lng: number } | null>(null);

  // Cargar perfil
  useEffect(() => {
    // Antes de cargar, disparar verificación de caducidad.
    // Si hay docs vencidos, el backend cambia el status a ExpiredDocs y
    // luego /drivers/me devuelve el status actualizado.
    apiFetch(`${API.drivers}/drivers/me/check-expiration`, { method: 'POST' })
      .catch(() => {})  // si falla la verificación, igual cargamos el perfil
      .finally(() => {
        apiFetch<DriverProfile>(`${API.drivers}/drivers/me`)
          .then(p => {
            setProfile(p);
            // Si ya estaba online con coordenadas, usarlas
            if (p.currentLat && p.currentLng) {
              setMyPos({ lat: p.currentLat, lng: p.currentLng });
            }
          })
          .catch(async () => {
            try {
              const created = await apiFetch<DriverProfile>(
                `${API.drivers}/drivers/register`, { method: 'POST' }
              );
              setProfile(created);
            } catch {
              setError('No se pudo cargar tu perfil de conductor.');
            }
          })
          .finally(() => setLoading(false));
      });
  }, []);

  // Obtener GPS del navegador y actualizar myPos en tiempo real
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watcher = navigator.geolocation.watchPosition(
      pos => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsState('ok');
      },
      err => {
        if (err.code === 1) setGpsState('denied');
        else setGpsState('error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  async function toggle() {
    if (!profile) return;
    setSaving(true); setError(null);

    try {
      if (profile.isOnline) {
        const d = await apiFetch<DriverProfile>(
          `${API.drivers}/drivers/go-offline`, { method: 'PUT' }
        );
        setProfile(d);
      } else {
        // Pedir GPS con feedback claro
        setGpsState('requesting');

        const getPos = (): Promise<{ lat: number; lng: number }> =>
          new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              ()  => resolve(myPos ?? defaultLoc), // usar última posición conocida o fallback
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
          });

        const pos = await getPos();
        setMyPos(pos);
        setGpsState('ok');

        const d = await apiFetch<DriverProfile>(`${API.drivers}/drivers/go-online`, {
          method: 'PUT',
          body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
        });
        setProfile(d);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cambiar estado.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  const approved = profile?.status === 3;
  const online   = profile?.isOnline ?? false;
  const mapCenter = myPos ?? defaultLoc;
  const isRealPos = !!myPos;

  return (
    <>
      <PageHeader
        title="Disponibilidad"
        subtitle="Activa tu estado para recibir solicitudes."
        icon="fa-solid fa-circle-dot"
      />

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {!approved && (
        <div className="alert alert-warning mb-3 small">
          <i className="fa-solid fa-triangle-exclamation me-2" />
          Tu cuenta aún no está aprobada por el admin.
        </div>
      )}

      {/* Estado GPS */}
      {gpsState === 'requesting' && (
        <div className="alert alert-info small mb-3">
          <span className="spinner-border spinner-border-sm me-2" />
          Obteniendo tu ubicación GPS… por favor espera.
        </div>
      )}
      {gpsState === 'denied' && (
        <div className="alert alert-warning small mb-3">
          <i className="fa-solid fa-location-slash me-2" />
          Permiso de ubicación denegado. Se usará una posición de referencia.
          Activa el GPS en tu navegador para mayor precisión.
        </div>
      )}
      {gpsState === 'ok' && online && (
        <div className="alert alert-success small mb-3 py-2">
          <i className="fa-solid fa-location-dot me-2" />
          Ubicación real activa — conductores y pasajeros pueden verte.
        </div>
      )}

      {/* Card de estado */}
      <div className="bugie-card mb-3">
        <div className="bugie-card-body d-flex align-items-center justify-content-between">
          <div>
            <div className="fw-bold mb-1">Estado actual</div>
            <span className={`badge rounded-pill text-bg-${online ? 'success' : 'secondary'} fs-6 px-3`}>
              {online ? 'En línea' : 'Desconectado'}
            </span>
          </div>
          <button
            className={`btn rounded-pill px-4 ${online ? 'btn-outline-danger' : 'btn-bugie text-white'}`}
            onClick={toggle}
            disabled={saving || !approved}
          >
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2" />
                  {gpsState === 'requesting' ? 'Obteniendo GPS…' : 'Procesando…'}
                </>
              : online ? 'Desconectarme' : 'Conectarme'
            }
          </button>
        </div>
      </div>

      {/* Mapa con posición real */}
      <div style={{ position: 'relative' }}>
        <BugieMap
          key={isRealPos ? `real-${Math.round(mapCenter.lat * 1000)}` : 'default'}
          height={340}
          center={isRealPos ? mapCenter : undefined}
          zoom={isRealPos ? 15 : undefined}
          markers={online || isRealPos ? [{
            ...mapCenter,
            label: isRealPos ? 'Tu ubicación real' : 'Ubicación de referencia',
            type: 'driver',
          }] : []}
        />
        {!isRealPos && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(0,0,0,0.7)', color: '#fff',
            fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6,
          }}>
            <i className="fa-solid fa-circle-info me-1" />
            Esperando GPS real…
          </div>
        )}
        {isRealPos && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(25,135,84,0.85)', color: '#fff',
            fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6,
          }}>
            <i className="fa-solid fa-location-dot me-1" />
            Ubicación real del navegador
          </div>
        )}
      </div>
    </>
  );
}