import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';

interface Trip {
  id: string; originAddress: string; destAddress: string;
  finalFare: number | null; estimatedFare: number;
  paymentMethod: string; status: number;
  createdAt: string; completedAt: string | null;
}

interface Incident {
  id: string; tripId: string; reportedByUserId: string;
  reportedByRole: string; description: string; createdAt: string;
}

const STATUS: Record<number, { label: string; color: string; icon: string }> = {
  1: { label: 'Pendiente',  color: '#f59e0b', icon: 'fa-clock'                },
  2: { label: 'Aceptado',   color: '#38bdf8', icon: 'fa-car'                  },
  3: { label: 'En curso',   color: '#818cf8', icon: 'fa-location-dot'         },
  4: { label: 'Completado', color: '#34d399', icon: 'fa-circle-check'         },
  5: { label: 'Cancelado',  color: '#94a3b8', icon: 'fa-circle-xmark'         },
  6: { label: 'SOS',        color: '#f87171', icon: 'fa-triangle-exclamation' },
};

const PAY: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen'   },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen'   },
};

export default function DriverTrips() {
  const [trips,     setTrips]     = useState<Trip[]>([]);
  const [myReports, setMyReports] = useState<Record<string, Incident | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [reportingTrip, setReportingTrip] = useState<Trip | null>(null);

  useEffect(() => {
    apiFetch<Trip[]>(`${API.trips}/trips/history`)
      .then(async list => {
        setTrips(list);
        if (list.length > 0) {
          const params = list.map(t => `ids=${t.id}`).join('&');
          try {
            const map = await apiFetch<Record<string, Incident | null>>(
              `${API.trips}/trips/incidents/me/by-trips?${params}`);
            setMyReports(map ?? {});
          } catch {}
        }
      })
      .catch(() => setError('No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  const completed  = trips.filter(t => t.status === 4);
  const totalGanado = completed.reduce((s, t) => s + (t.finalFare ?? t.estimatedFare), 0);

  function handleReported(tripId: string, inc: Incident) {
    setMyReports(prev => ({ ...prev, [tripId]: inc }));
    setReportingTrip(null);
  }

  return (
    <>
      <PageHeader title="Historial de viajes" subtitle="Todos los viajes que has realizado." icon="fa-solid fa-clock-rotate-left" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {trips.length > 0 && (
        <div className="row g-3 mb-4">
          {[
            { label: 'Total viajes',  value: String(trips.length),           icon: 'fa-route',        color: '#818cf8' },
            { label: 'Completados',   value: String(completed.length),       icon: 'fa-circle-check', color: '#34d399' },
            { label: 'Total ganado',  value: `S/ ${totalGanado.toFixed(2)}`, icon: 'fa-wallet',       color: '#f59e0b' },
          ].map(k => (
            <div className="col-4" key={k.label}>
              <div className="bugie-card p-3 text-center">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div className="fw-bold fs-5">{k.value}</div>
                <div className="small bugie-muted">{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {trips.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
            <i className="fa-solid fa-route" />
          </div>
          <div className="fw-semibold mb-2">Sin viajes aún</div>
          <div className="small bugie-muted">Tus viajes aparecerán aquí una vez que los completes.</div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {trips.map(t => {
            const s   = STATUS[t.status] ?? { label: '?', color: '#94a3b8', icon: 'fa-circle' };
            const pay = PAY[t.paymentMethod] ?? { label: t.paymentMethod, icon: 'fa-credit-card' };
            const fare = t.finalFare ?? t.estimatedFare;
            const date = new Date(t.createdAt);
            const hasIncident = !!myReports[t.id];

            return (
              <div key={t.id} className="bugie-card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 3, background: s.color }} />
                <div className="p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fa-solid ${s.icon} small`} style={{ color: s.color }} />
                      </div>
                      <div>
                        <div className="fw-semibold small" style={{ color: s.color }}>{s.label}</div>
                        <div className="small bugie-muted">
                          {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' · '}
                          {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-end">
                      {t.status === 4 ? (
                        <>
                          <div className="fw-bold fs-5" style={{ color: '#34d399' }}>S/ {fare.toFixed(2)}</div>
                          <div className="small bugie-muted d-flex align-items-center gap-1 justify-content-end">
                            <i className={`fa-solid ${pay.icon}`} style={{ fontSize: '0.7rem' }} />
                            {pay.label}
                          </div>
                        </>
                      ) : (
                        <span className="small bugie-muted">—</span>
                      )}
                    </div>
                  </div>

                  <div className="d-flex flex-column gap-1 mb-3"
                       style={{ borderLeft: '2px solid var(--bugie-border)', paddingLeft: 12, marginLeft: 4 }}>
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C6AF7', marginLeft: -17, flexShrink: 0 }} />
                      <div className="small text-truncate" style={{ maxWidth: 260 }}>{t.originAddress}</div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C060C0', marginLeft: -17, flexShrink: 0 }} />
                      <div className="small text-truncate" style={{ maxWidth: 260 }}>{t.destAddress}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setReportingTrip(t)}
                    className="btn btn-sm rounded-pill d-inline-flex align-items-center gap-2"
                    style={{
                      background: hasIncident ? '#f5970022' : 'transparent',
                      color:      hasIncident ? '#f59700'   : 'var(--bugie-muted)',
                      border:     `1px solid ${hasIncident ? '#f5970055' : 'var(--bugie-border)'}`,
                      fontSize:   '0.75rem',
                    }}>
                    <i className={`fa-solid ${hasIncident ? 'fa-triangle-exclamation' : 'fa-flag'}`}
                       style={{ fontSize: '0.7rem' }} />
                    {hasIncident ? 'Ver mi incidencia' : 'Reportar incidencia'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reportingTrip && (
        <ReportIncidentModal
          trip={reportingTrip}
          existing={myReports[reportingTrip.id] ?? null}
          onClose={() => setReportingTrip(null)}
          onSaved={inc => handleReported(reportingTrip.id, inc)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ReportIncidentModal({ trip, existing, onClose, onSaved }: {
  trip: Trip;
  existing: Incident | null;
  onClose: () => void;
  onSaved: (inc: Incident) => void;
}) {
  const [text, setText]     = useState(existing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const readonly = !!existing;

  async function submit() {
    if (text.trim().length < 5) {
      setError('Escribe al menos 5 caracteres.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const inc = await apiFetch<Incident>(
        `${API.trips}/trips/incidents/${trip.id}`,
        { method: 'POST', body: JSON.stringify({ description: text.trim() }) });
      onSaved(inc);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la incidencia.');
    } finally { setSaving(false); }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          background: 'var(--bugie-surface)',
          borderRadius: 16, overflow: 'hidden',
        }}
      >
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="d-flex align-items-center gap-2">
            <i className="fa-solid fa-flag" style={{ color: '#f59700' }} />
            <span className="fw-bold">{readonly ? 'Mi incidencia' : 'Reportar incidencia'}</span>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-3">
          <div className="small bugie-muted mb-2 text-truncate">
            <i className="fa-solid fa-route me-1" />
            {trip.originAddress} → {trip.destAddress}
          </div>

          {!readonly && (
            <div className="small bugie-muted mb-2">
              Cuéntanos qué pasó. Tu reporte llega al equipo de monitoreo.
            </div>
          )}

          <textarea
            className="form-control mb-2" rows={5} maxLength={1000}
            placeholder="Describe la incidencia…"
            value={text} onChange={e => setText(e.target.value)}
            disabled={readonly || saving}
            style={{ resize: 'vertical' }}
          />

          {!readonly && (
            <div className="small bugie-muted text-end" style={{ fontSize: '0.72rem' }}>
              {text.length}/1000
            </div>
          )}

          {error && <div className="alert alert-danger small mt-2 mb-0">{error}</div>}

          <div className="d-flex gap-2 mt-3 justify-content-end">
            <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
              {readonly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!readonly && (
              <button onClick={submit} disabled={saving || text.trim().length < 5}
                className="btn btn-sm rounded-pill text-white"
                style={{ background: '#f59700', border: 'none' }}>
                {saving
                  ? <><span className="spinner-border spinner-border-sm me-2" />Enviando…</>
                  : <><i className="fa-solid fa-paper-plane me-2" />Enviar</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}