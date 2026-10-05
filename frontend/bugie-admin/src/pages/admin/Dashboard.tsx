import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch } from '../../state/api';
import { useMonitorHub } from '../../hooks/useMonitorHub';
import { usePermissions, PERMS } from '../../state/permissions';
import { EmptyState, Page, SectionCard, Skeleton, StatCard, StatGrid, StatusBadge, Tone } from '../../components/ui';

// Cada cuánto se refrescan solos los números del panel.
const REFRESH_MS = 30_000;

// null = el rol no tiene permiso para esa sección (no se pide ni se muestra).
// 'error' = no se pudo leer: se muestra el error en la tarjeta (nunca un 0 falso).
type Kpi = number | null | 'error';
interface Stats {
  onlineDrivers: Kpi; pendingDrivers: Kpi;
  activeSos: Kpi;     pendingTrips: Kpi;
}

const isNum = (v: Kpi): v is number => typeof v === 'number';

// Servicios cuyo estado se muestra. URLs del .env (VITE_API_*).
const SERVICES = [
  { name: 'Cuentas',     url: `${API.auth}/health`,            desc: 'Inicio de sesión y usuarios' },
  { name: 'Viajes',      url: `${API.trips}/health`,           desc: 'Viajes, rutas y SOS' },
  { name: 'Conductores', url: `${API.drivers}/health`,         desc: 'Conductores y vehículos' },
  { name: 'Pagos',       url: `${API.payments}/health`,        desc: 'Pagos y ganancias' },
  { name: 'Sitio web',   url: `${API.landing}/health`,         desc: 'Contenido público' },
  { name: 'Puntos',      url: `${API.rewards}/rewards/health`, desc: 'Puntos, canjes y sorteos' },
];

export default function Dashboard() {
  const { has, permissions, loading: permsLoading } = usePermissions();
  // Cada KPI usa un endpoint de otra sección: solo se pide si el rol tiene ese permiso
  // (el backend también lo valida y respondería 403).
  const can = useMemo(() => ({
    online: permissions.includes(PERMS.ViewLiveMap),
    verify: permissions.includes(PERMS.ViewVerification),
    sos:    permissions.includes(PERMS.ViewSosCenter),
    trips:  permissions.includes(PERMS.ViewTrips),
  }), [permissions]);
  const [stats,   setStats]   = useState<Stats>({ onlineDrivers: null, pendingDrivers: null, activeSos: null, pendingTrips: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Momento de la última carga y "ahora" (se mueve cada segundo) para el texto "Actualizado hace X s".
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now,       setNow]       = useState(Date.now());
  // Sube en cada refresco: hace que "Estado de servicios" vuelva a comprobar.
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    if (permsLoading) return;
    setRefreshing(true);
    // Cuenta los elementos de una lista; null si el rol no tiene permiso (no se pide);
    // 'error' si la API no respondió.
    const count = (allowed: boolean, url: string): Promise<Kpi> =>
      allowed
        ? apiFetch<unknown[]>(url).then(r => (Array.isArray(r) ? r.length : 0)).catch((): Kpi => 'error')
        : Promise.resolve(null);
    Promise.all([
      count(can.online, `${API.drivers}/drivers/online`),
      count(can.verify, `${API.drivers}/drivers/pending`),
      count(can.sos,    `${API.trips}/sos/admin/active`),
      // KPIs de admin (pending = esperando conductor o negociando). No usar
      // /trips/pending: es el de los conductores y filtra por su ubicación.
      can.trips
        ? apiFetch<{ pending: number }>(`${API.trips}/trips/admin/stats`).then((t): Kpi => t?.pending ?? 0).catch((): Kpi => 'error')
        : Promise.resolve(null as Kpi),
    ]).then(([onlineDrivers, pendingDrivers, activeSos, pendingTrips]) => {
      setStats({ onlineDrivers, pendingDrivers, activeSos, pendingTrips });
      setUpdatedAt(Date.now());
      setRefreshKey(k => k + 1);
    }).finally(() => { setLoading(false); setRefreshing(false); });
  }, [permsLoading, can]);

  // Carga inicial + refresco cada 30 s + al volver a la pestaña.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Reloj para el texto "Actualizado hace X s".
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // SOS nuevo (SignalR): refrescar al instante, sin esperar los 30 s.
  useMonitorHub({ onSos: load });

  const secondsAgo = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const updatedText = secondsAgo === null ? 'Cargando…'
    : secondsAgo < 60 ? `Actualizado hace ${secondsAgo} s`
    : `Actualizado hace ${Math.floor(secondsAgo / 60)} min`;

  // KPIs y enlaces: solo los de secciones que el rol puede abrir.
  const kpis = ([
    { show: can.online, label: 'Conductores en línea', value: stats.onlineDrivers,  hint: 'Disponibles ahora',      icon: 'fa-circle-dot',           tone: 'ok',      to: '/admin/monitoreo' },
    { show: can.trips,  label: 'Viajes pendientes',    value: stats.pendingTrips,   hint: 'Sin conductor asignado', icon: 'fa-route',                tone: 'warn',    to: '/admin/viajes' },
    { show: can.verify, label: 'Por verificar',        value: stats.pendingDrivers, hint: 'Conductores en espera',  icon: 'fa-id-card',              tone: 'primary', to: '/admin/verificacion' },
    { show: can.sos,    label: 'Alertas SOS',          value: stats.activeSos,      hint: 'Requieren atención',     icon: 'fa-triangle-exclamation', tone: 'bad',     to: '/admin/sos' },
  ] as { show: boolean; label: string; value: Kpi; hint: string; icon: string; tone: Tone; to: string }[]).filter(k => k.show);

  // Bandeja de pendientes: solo lo que el usuario puede abrir.
  const pending = [
    { show: has(PERMS.ViewSosCenter), count: stats.activeSos,      to: '/admin/sos',          icon: 'fa-shield-halved', tone: 'bad'  as Tone, title: 'Alertas SOS activas',         sub: 'Atiéndelas primero: hay un pasajero o conductor pidiendo ayuda.' },
    { show: has(PERMS.ViewVerification), count: stats.pendingDrivers, to: '/admin/verificacion', icon: 'fa-id-card',       tone: 'warn' as Tone, title: 'Conductores por verificar',   sub: 'Revisa sus documentos para que puedan empezar a trabajar.' },
    { show: has(PERMS.ViewTrips),     count: stats.pendingTrips,   to: '/admin/viajes',       icon: 'fa-route',         tone: 'warn' as Tone, title: 'Viajes sin conductor',        sub: 'Pasajeros esperando que un conductor acepte.' },
  ].filter(p => p.show);
  const totalPending = pending.reduce((s, p) => s + (isNum(p.count) ? p.count : 0), 0);
  const pendingError = pending.some(p => p.count === 'error');
  const anyError = pendingError || kpis.some(k => k.value === 'error');

  return (
    <Page
      title="Centro de operación"
      subtitle="Lo que pasa ahora en Bugie y lo que necesita tu atención."
      helpKey="dashboard"
      extra={<><i className={`fa-solid fa-rotate ${refreshing ? 'fa-spin' : ''}`} aria-hidden="true" /><span aria-live="polite">{updatedText}</span></>}
      actions={[{ label: 'Actualizar', icon: 'fa-rotate-right', onClick: load, loading: refreshing && !loading }]}
    >
      {anyError && !loading && (
        <div className="alert alert-warning small d-flex align-items-center gap-2 flex-wrap" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span className="flex-grow-1">Algunos datos no se pudieron cargar. Las tarjetas marcadas con «Sin datos» no están al día.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load}>Reintentar</button>
        </div>
      )}

      {kpis.length > 0 && <StatGrid tourId="dash-stats">
        {kpis.map(k => (
          <StatCard
            key={k.label}
            label={k.label}
            value={isNum(k.value) ? k.value : 'Sin datos'}
            hint={k.value === 'error' ? 'No se pudo cargar' : k.hint}
            icon={k.value === 'error' ? 'fa-triangle-exclamation' : k.icon}
            tone={k.value === 'error' ? 'neutral' : k.tone}
            to={k.to}
            loading={loading}
            pulse={isNum(k.value) && k.value > 0 && (k.tone === 'bad' || k.tone === 'ok')}
          />
        ))}
      </StatGrid>}

      <div className="bx-split">
        <SectionCard
          title="Pendientes"
          icon="fa-inbox"
          description="Tareas que esperan una acción tuya."
          actions={!loading && totalPending > 0 ? <StatusBadge tone="warn">{totalPending}{pendingError ? '+' : ''} en total</StatusBadge> : undefined}
          flush
          tourId="dash-pending"
        >
          {loading || permsLoading ? (
            <div className="p-3 d-grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={40} radius={10} />)}
            </div>
          ) : pending.length === 0 ? (
            <EmptyState compact title="Sin bandejas disponibles" text="Tu rol no tiene acceso a SOS, verificación ni viajes." />
          ) : totalPending === 0 && !pendingError ? (
            <EmptyState compact variant="done" title="Todo al día" text="No hay alertas, verificaciones ni viajes esperando." />
          ) : (
            <div className="bx-inbox">
              {pending.map(p => (
                <Link key={p.to} to={p.to} className="bx-inbox-item">
                  <span className={`bx-stat-icon bx-tone-${p.count === 'error' ? 'neutral' : isNum(p.count) && p.count > 0 ? p.tone : 'ok'}`} aria-hidden="true"><i className={`fa-solid ${p.icon}`} /></span>
                  <span className="text">
                    <span className="title d-block">{p.title}</span>
                    <span className="sub d-block">{p.sub}</span>
                  </span>
                  {p.count === 'error'
                    ? <StatusBadge tone="neutral" icon="fa-triangle-exclamation">Sin datos</StatusBadge>
                    : isNum(p.count) && p.count > 0
                    ? <StatusBadge tone={p.tone}>{p.count}</StatusBadge>
                    : <StatusBadge tone="ok" icon="fa-check">Al día</StatusBadge>}
                  <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Estado de servicios"
          icon="fa-server"
          description="Se comprueba en cada actualización."
          tourId="dash-services"
        >
          <div className="d-grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
            {SERVICES.map(s => <ApiStatus key={s.name} name={s.name} url={s.url} desc={s.desc} refreshKey={refreshKey} />)}
          </div>
        </SectionCard>
      </div>
    </Page>
  );
}

function ApiStatus({ name, url, desc, refreshKey }: { name: string; url: string; desc: string; refreshKey: number }) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    // Endpoint /health es público en TODAS las APIs: no requiere token ni rol.
    fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) })
      .then(r => r.ok ? setStatus('online') : setStatus('offline'))
      .catch(() => setStatus('offline'));
  }, [url, refreshKey]);

  const cfg = {
    online:   { tone: 'ok'   as Tone, label: 'En línea' },
    offline:  { tone: 'bad'  as Tone, label: 'Sin conexión' },
    checking: { tone: 'warn' as Tone, label: 'Comprobando' },
  }[status];

  return (
    <div
      className="d-flex align-items-center justify-content-between gap-2 px-3 py-2"
      style={{ border: '1px solid var(--bugie-border)', borderRadius: 12, minWidth: 0 }}
      title={desc}
    >
      <span className="fw-semibold small text-truncate">{name}</span>
      <StatusBadge tone={cfg.tone} dot size="sm">{cfg.label}</StatusBadge>
    </div>
  );
}
