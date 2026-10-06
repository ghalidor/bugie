import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { API } from './api';
import { getToken } from './session';

/**
 * Cliente SignalR compartido del hub /hubs/trips (Trips API).
 *
 * Una sola conexión por sesión: varias pantallas se suscriben con
 * useTripsHub() y la conexión vive mientras haya al menos un suscriptor
 * (el AppShell siempre lo es mientras hay sesión). Al cerrar sesión el
 * AppShell se desmonta, el último suscriptor se va y la conexión se cierra.
 *
 * - JWT por query (?access_token=) vía accessTokenFactory con el token actual.
 * - Reconexión automática (0, 2, 5, 10, 30 s). Si se cierra sin reconectar,
 *   reintenta cada 15 s mientras haya suscriptores; también al volver visible
 *   la pestaña.
 * - Tras reconectar vuelve a entrar a los grupos de viaje y emite 'reconnected'
 *   para que cada pantalla haga una recarga completa.
 * - El mismo evento puede llegar dos veces (grupo del viaje + grupo del
 *   usuario): TripChanged / ProposalsChanged / RequestsChanged se agrupan con
 *   un debounce de 250 ms por evento + tripId.
 */

/// URL del hub: la base de Trips termina en /api, pero el hub se monta en la raíz.
function hubUrl(): string {
  const base: string = API.trips;
  const root = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${root}/hubs/trips`;
}

export type HubStatus = 'disconnected' | 'connecting' | 'connected';

export interface TripChangedEvent {
  tripId: string;
  status: number;
  reason: string;
  at: string;
}

export interface ProposalsChangedEvent {
  tripId: string;
  proposalId?: string | null;
  driverId?: string | null;
  status?: string | null;
  reason: string;
  at: string;
}

export interface DriverLocationEvent {
  tripId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speedKmh?: number | null;
  at: string;
}

export interface RequestsChangedEvent {
  tripId: string;
  reason: string;
  at: string;
}

export interface UserNotificationEvent {
  type?: string | null;
  title: string;
  body: string;
  /// route, trip_id, alert_type, service, from_role, type, notification_id, ...
  data: Record<string, string>;
  at: string;
}

export interface TripsHubEvents {
  TripChanged: TripChangedEvent;
  ProposalsChanged: ProposalsChangedEvent;
  DriverLocation: DriverLocationEvent;
  RequestsChanged: RequestsChangedEvent;
  UserNotification: UserNotificationEvent;
  /// La conexión volvió tras una caída: conviene recargar todo una vez.
  reconnected: void;
}

type EventName = keyof TripsHubEvents;
type Handler<K extends EventName> = (payload: TripsHubEvents[K]) => void;

const RETRY_MS = 15_000;
const DEBOUNCE_MS = 250;
const DEBOUNCED: EventName[] = ['TripChanged', 'ProposalsChanged', 'RequestsChanged'];

const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function createTripsHub() {
  let conn: HubConnection | null = null;
  let status: HubStatus = 'disconnected';
  let consumers = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const joinedTrips = new Set<string>();
  const statusListeners = new Set<(s: HubStatus) => void>();
  const listeners = new Map<EventName, Set<(payload: unknown) => void>>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function setStatus(next: HubStatus) {
    if (status === next) return;
    status = next;
    statusListeners.forEach(fn => { try { fn(next); } catch (e) { console.warn('TripsHub: listener de estado', e); } });
  }

  function emit<K extends EventName>(event: K, payload: TripsHubEvents[K]) {
    listeners.get(event)?.forEach(fn => { try { fn(payload); } catch (e) { console.warn(`TripsHub: error en handler de ${event}`, e); } });
  }

  /// Agrupa repeticiones del mismo evento para el mismo viaje (250 ms).
  function emitDebounced<K extends EventName>(event: K, tripId: string, payload: TripsHubEvents[K]) {
    const key = `${event}:${tripId}`;
    const prev = debounceTimers.get(key);
    if (prev) clearTimeout(prev);
    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key);
      emit(event, payload);
    }, DEBOUNCE_MS));
  }

  function clearRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function scheduleRetry() {
    if (retryTimer || consumers === 0) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, RETRY_MS);
  }

  /// Vuelve a entrar a los grupos de viaje que las pantallas tienen abiertos.
  async function rejoinAll() {
    for (const tripId of Array.from(joinedTrips)) {
      try { await conn?.invoke('JoinTrip', tripId); }
      catch (e) { joinedTrips.delete(tripId); console.warn('TripsHub: no se pudo volver a entrar al viaje', tripId, e); }
    }
  }

  function build(): HubConnection {
    const c = new HubConnectionBuilder()
      .withUrl(hubUrl(), { accessTokenFactory: () => getToken() ?? '' })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    c.on('TripChanged', (p: any) => {
      const tripId = str(p?.tripId);
      emitDebounced('TripChanged', tripId, {
        tripId, status: Number(p?.status ?? 0), reason: str(p?.reason), at: str(p?.at),
      });
    });

    c.on('ProposalsChanged', (p: any) => {
      const tripId = str(p?.tripId);
      emitDebounced('ProposalsChanged', tripId, {
        tripId,
        proposalId: strOrNull(p?.proposalId),
        driverId:   strOrNull(p?.driverId),
        status:     strOrNull(p?.status),
        reason:     str(p?.reason),
        at:         str(p?.at),
      });
    });

    c.on('DriverLocation', (p: any) => {
      const lat = Number(p?.lat), lng = Number(p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      emit('DriverLocation', {
        tripId: str(p?.tripId), lat, lng,
        heading: numOrNull(p?.heading), speedKmh: numOrNull(p?.speedKmh), at: str(p?.at),
      });
    });

    c.on('RequestsChanged', (p: any) => {
      const tripId = str(p?.tripId);
      emitDebounced('RequestsChanged', tripId, { tripId, reason: str(p?.reason), at: str(p?.at) });
    });

    c.on('UserNotification', (p: any) => {
      const data: Record<string, string> = {};
      if (p?.data && typeof p.data === 'object') {
        for (const [k, v] of Object.entries(p.data)) data[k] = str(v);
      }
      emit('UserNotification', {
        type: strOrNull(p?.type), title: str(p?.title), body: str(p?.body), data, at: str(p?.at),
      });
    });

    c.onreconnecting(() => setStatus('connecting'));
    c.onreconnected(async () => {
      setStatus('connected');
      await rejoinAll();
      emit('reconnected', undefined);
    });
    c.onclose(() => {
      // Si ya no es la conexión vigente, la cerramos nosotros (stop): no reintentar.
      if (c !== conn) return;
      setStatus('disconnected');
      scheduleRetry();
    });

    return c;
  }

  function connect() {
    if (consumers === 0) return;
    if (!getToken()) return;
    if (!conn) conn = build();
    if (conn.state !== HubConnectionState.Disconnected) return;

    clearRetry();
    setStatus('connecting');
    const c = conn;
    c.start()
      .then(async () => {
        if (c !== conn) return; // se cerró (stop) mientras conectaba
        setStatus('connected');
        await rejoinAll();
      })
      .catch(err => {
        if (c !== conn) return;
        console.warn('TripsHub: no se pudo conectar', err);
        setStatus('disconnected');
        scheduleRetry();
      });
  }

  async function stop() {
    clearRetry();
    debounceTimers.forEach(clearTimeout);
    debounceTimers.clear();
    joinedTrips.clear();
    // Se suelta la referencia antes de cerrar: si alguien vuelve a suscribirse
    // mientras cierra, connect() crea una conexión nueva sin esperar.
    const c = conn;
    conn = null;
    setStatus('disconnected');
    if (c && c.state !== HubConnectionState.Disconnected) {
      try { await c.stop(); } catch { /* ya estaba cerrada */ }
    }
  }

  // Al volver visible la pestaña, si la conexión se cayó, reconectar.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && consumers > 0 && status === 'disconnected') connect();
    });
  }

  return {
    get status() { return status; },
    get connected() { return status === 'connected'; },

    /// Registra un suscriptor (pantalla). Devuelve la función para soltarlo;
    /// cuando no queda ninguno, la conexión se cierra.
    acquire(): () => void {
      consumers++;
      connect();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        consumers--;
        if (consumers <= 0) { consumers = 0; void stop(); }
      };
    },

    onStatus(fn: (s: HubStatus) => void): () => void {
      statusListeners.add(fn);
      return () => { statusListeners.delete(fn); };
    },

    on<K extends EventName>(event: K, fn: Handler<K>): () => void {
      let set = listeners.get(event);
      if (!set) { set = new Set(); listeners.set(event, set); }
      const wrapped = fn as (payload: unknown) => void;
      set.add(wrapped);
      return () => { set!.delete(wrapped); };
    },

    /**
     * Entra al grupo del viaje. true si el servidor aceptó; false si no hay
     * conexión o el servidor lo rechazó ("No tienes acceso a este viaje."):
     * en ese caso la pantalla sigue con su polling normal.
     */
    async joinTrip(tripId: string): Promise<boolean> {
      if (!tripId) return false;
      joinedTrips.add(tripId);
      if (!conn || status !== 'connected') return false;
      try {
        await conn.invoke('JoinTrip', tripId);
        return true;
      } catch (e) {
        joinedTrips.delete(tripId);
        console.warn('TripsHub: JoinTrip rechazado', tripId, e);
        return false;
      }
    },

    async leaveTrip(tripId: string): Promise<void> {
      if (!tripId) return;
      joinedTrips.delete(tripId);
      if (!conn || status !== 'connected') return;
      try { await conn.invoke('LeaveTrip', tripId); } catch { /* la conexión ya no está */ }
    },

    /// Cierra la conexión (p. ej. al cerrar sesión).
    stop,
  };
}

export const tripsHub = createTripsHub();
