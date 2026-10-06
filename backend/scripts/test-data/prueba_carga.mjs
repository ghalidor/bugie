// =====================================================================
// Bugie - prueba de carga contra bugie_test (APIs levantadas con levantar_apis_test.sh).
//
// Simula un dia de movimiento comprimido en minutos:
//   - N conductores "virtuales" conectados (sin viaje) mandando posicion cada 30 s.
//   - M conductores en viaje mandando GPS por lotes (3-5 puntos cada 12 s) por rutas
//     reales de GraphHopper (localhost:8989), con pasajeros que piden, negocian,
//     viajan y califican. Cada viaje completo deja pagos, puntos, notificaciones.
//   - Mide latencia (p50/p95/max) y errores por endpoint, y el tamanio de la cola de
//     posiciones (log de Drivers).
// Los datos NO se borran: quedan como "un dia de movimiento" para revisarlos.
//
// Uso: node scripts/test-data/prueba_carga.mjs [--drivers=500] [--idle=1000] [--minutes=20] [--trips=300]
//   Las cuentas de carga (cargacNNNN@bugie.test / cargapNNNN@bugie.test) se crean directo en BD,
//   sin correos; --no-register reutiliza las de una corrida anterior.
// =====================================================================
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? 'true'] : [a, 'true']; }));
const N_TRIP = +(args.drivers ?? 50);    // conductores en viaje a la vez (prudente por defecto; el dueno sube el numero)
const N_IDLE = +(args.idle ?? 100);      // conductores conectados sin viaje
const MINUTES = +(args.minutes ?? 10);
const MAX_TRIPS = +(args.trips ?? 200);
const REGISTER = args['no-register'] !== 'true';
const PASSWORD = '10203040';
const API = { auth: 'http://127.0.0.1:5001/api', trips: 'http://127.0.0.1:5002/api', drivers: 'http://127.0.0.1:5003/api', landing: 'http://127.0.0.1:5005/api' };
const GH = 'http://localhost:8989';
const PSQL = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const sql = q => execFileSync(PSQL, ['-U', 'postgres', '-d', 'bugie_test', '-Atc', q], { env: { ...process.env, PGPASSWORD: '147896321', PGCLIENTENCODING: 'UTF8' } }).toString().trim();

// ---------------------------------------------------------------- metricas
const lat = {};  // endpoint -> [ms]
const errs = {}; // endpoint -> {status: count}
function rec(name, ms, status) { (lat[name] ??= []).push(ms); if (status >= 400 || status === 0) { errs[name] ??= {}; errs[name][status] = (errs[name][status] ?? 0) + 1; } }
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function call(name, method, url, token, body) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`; if (body !== undefined) h['Content-Type'] = 'application/json';
  const t0 = performance.now();
  try {
    const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const txt = await r.text(); let d = txt; try { d = JSON.parse(txt); } catch {}
    rec(name, performance.now() - t0, r.status); return { status: r.status, data: d };
  } catch (e) { rec(name, performance.now() - t0, 0); return { status: 0, data: String(e) }; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const peru = d => new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 19);

// ---------------------------------------------------------------- geo (Tacna)
const SPOTS = [
  [-18.0137, -70.2510], [-18.0119, -70.2502], [-18.0066, -70.2462], [-18.0243, -70.2518], [-18.0301, -70.2448],
  [-18.0056, -70.2580], [-17.9960, -70.2400], [-18.0400, -70.2600], [-18.0180, -70.2300], [-18.0010, -70.2650],
  [-18.0330, -70.2360], [-18.0470, -70.2470], [-17.9900, -70.2520], [-18.0220, -70.2700], [-18.0090, -70.2260],
];
const routeCache = new Map();
async function ruta(a, b) {
  const k = a.join(',') + '|' + b.join(',');
  if (routeCache.has(k)) return routeCache.get(k);
  try {
    const r = await fetch(`${GH}/route?point=${a[0]},${a[1]}&point=${b[0]},${b[1]}&profile=car&points_encoded=false`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json(); const pts = j.paths?.[0]?.points?.coordinates?.map(([lng, lat]) => [lat, lng]);
    const out = pts && pts.length > 1 ? pts : [a, b]; routeCache.set(k, out); return out;
  } catch { return [a, b]; }
}
const dist = (p, q) => { const R = 6371000, toR = x => x * Math.PI / 180; const dLat = toR(q[0] - p[0]), dLng = toR(q[1] - p[1]); const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(p[0])) * Math.cos(toR(q[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
function densificar(pts, step = 100) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = dist(a, b), n = Math.max(1, Math.round(d / step)); for (let j = 1; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); } return out; }
const heading = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360;

// ---------------------------------------------------------------- cuentas
const login = async (email) => (await call('auth/login', 'POST', `${API.auth}/auth/login`, null, { email, password: PASSWORD })).data;
const admin = await login('admin@bugie.pe');
const n = N_TRIP + N_IDLE;
let drivers = [], passengers = [];
if (REGISTER) {
  // Cuentas de carga creadas directo en BD (sin correos): misma contrasena que los demas
  // usuarios de prueba (se copia el hash del admin), conductores ya aprobados.
  console.log(`Creando ${n} conductores y ${N_TRIP} pasajeros de carga en BD (sin correos)...`);
  sql(`INSERT INTO auth.users (email, passwordhash, role, fullname, phone, isactive, isverified, termsaccepted, doctype, docnumber, firstnames, lastnamepaternal, lastnamematernal)
       SELECT 'cargac' || lpad(i::text, 4, '0') || '@bugie.test', (SELECT passwordhash FROM auth.users WHERE email = 'admin@bugie.pe'), 'driver',
              'Carga ' || i || ' Prueba Conductor', '97' || lpad((100000 + i)::text, 7, '0'), true, true, true, 'DNI', '9' || lpad((1000000 + i)::text, 7, '0'),
              'Carga ' || i, 'Prueba', 'Conductor'
       FROM generate_series(0, ${n - 1}) i
       ON CONFLICT DO NOTHING`);
  sql(`INSERT INTO drivers.drivers (userid, status, approvedat, isonline)
       SELECT u.id, 3, now() AT TIME ZONE 'utc', true FROM auth.users u
       WHERE u.email LIKE 'cargac%@bugie.test' AND NOT EXISTS (SELECT 1 FROM drivers.drivers d WHERE d.userid = u.id)`);
  sql(`INSERT INTO auth.users (email, passwordhash, role, fullname, phone, isactive, isverified, termsaccepted, doctype, docnumber, firstnames, lastnamepaternal, lastnamematernal)
       SELECT 'cargap' || lpad(i::text, 4, '0') || '@bugie.test', (SELECT passwordhash FROM auth.users WHERE email = 'admin@bugie.pe'), 'passenger',
              'Pasajero ' || i || ' Prueba Carga', '98' || lpad((100000 + i)::text, 7, '0'), true, true, true, 'DNI', '8' || lpad((1000000 + i)::text, 7, '0'),
              'Pasajero ' || i, 'Prueba', 'Carga'
       FROM generate_series(0, ${N_TRIP - 1}) i
       ON CONFLICT DO NOTHING`);
}
{
  drivers = sql(`SELECT email||'|'||id FROM auth.users WHERE email LIKE 'cargac%@bugie.test' ORDER BY email`).split('\n').filter(Boolean).map(l => { const [email, userId] = l.split('|'); return { email, userId }; });
  passengers = sql(`SELECT email||'|'||id FROM auth.users WHERE email LIKE 'cargap%@bugie.test' ORDER BY email`).split('\n').filter(Boolean).map(l => { const [email, userId] = l.split('|'); return { email, userId }; });
}
console.log(`Cuentas: ${drivers.length} conductores, ${passengers.length} pasajeros. Iniciando sesion...`);
for (const u of [...drivers, ...passengers]) { const s = await login(u.email); u.token = s?.token; }
drivers = drivers.filter(d => d.token); passengers = passengers.filter(p => p.token);
for (const d of drivers) { const me = (await call('drivers/me', 'GET', `${API.drivers}/drivers/me`, d.token)).data; d.driverId = me?.id; d.pos = SPOTS[Math.floor(Math.random() * SPOTS.length)]; }
drivers = drivers.filter(d => d.driverId);

// ---------------------------------------------------------------- envio de posicion (lote si existe, si no 1 a 1)
let batchOk = true;
async function sendPoints(d, tripId, pts) {
  if (batchOk) {
    const r = await call('drivers/location/batch', 'PUT', `${API.drivers}/drivers/location/batch`, d.token, { driverId: d.driverId, tripId, points: pts.map(p => ({ lat: p.lat, lng: p.lng, speedKmh: p.speed, heading: p.heading, recordedAt: p.at })) });
    if (r.status === 404) batchOk = false; else return r;
  }
  let last; for (const p of pts) last = await call('drivers/location', 'PUT', `${API.drivers}/drivers/location`, d.token, { driverId: d.driverId, lat: p.lat, lng: p.lng, tripId, speedKmh: p.speed, heading: p.heading });
  return last;
}

// ---------------------------------------------------------------- escenario de un viaje completo
let tripsDone = 0, tripsFailed = 0, running = true;
async function unViaje(p, d) {
  const from = SPOTS[Math.floor(Math.random() * SPOTS.length)]; let to = SPOTS[Math.floor(Math.random() * SPOTS.length)]; if (to === from) to = SPOTS[(SPOTS.indexOf(from) + 1) % SPOTS.length];
  const km = dist(from, to) / 1000; const fare = Math.max(5, Math.round((5 + km * 1.5) * 2) / 2);
  await sendPoints(d, null, [{ lat: from[0] + rnd(-0.004, 0.004), lng: from[1] + rnd(-0.004, 0.004), speed: 0, heading: 0, at: peru(new Date()) }]);
  const t = await call('trips (crear)', 'POST', `${API.trips}/trips`, p.token, { originAddress: 'Origen carga', originLat: from[0], originLng: from[1], destAddress: 'Destino carga', destLat: to[0], destLng: to[1], estimatedFare: fare, paymentMethod: ['cash', 'yape', 'plin'][Math.floor(Math.random() * 3)], waypoints: [], serviceType: 0 });
  if (t.status !== 200 && t.status !== 201) { tripsFailed++; return; }
  const trip = t.data;
  // negociacion: 60% acepta tarifa, 40% propone +1..+3 y el pasajero acepta
  let ok;
  if (Math.random() < 0.6) {
    await call('trips/driver-accept', 'POST', `${API.trips}/trips/${trip.id}/driver-accept`, d.token, {});
    const ps = (await call('trips/proposals', 'GET', `${API.trips}/trips/${trip.id}/proposals`, p.token)).data; const mine = (Array.isArray(ps) ? ps : []).find(x => x.status === 'driver_accepted');
    ok = mine && (await call('trips/confirm-driver-acceptance', 'PUT', `${API.trips}/trips/${trip.id}/confirm-driver-acceptance/${mine.id}`, p.token, {})).status === 200;
  } else {
    const pr = await call('trips/propose', 'PUT', `${API.trips}/trips/${trip.id}/propose`, d.token, { proposedFare: fare + Math.ceil(rnd(1, 3)) });
    const pid = pr.data?.proposalId;
    ok = pid && (await call('trips/accept-proposal', 'PUT', `${API.trips}/trips/${trip.id}/accept-proposal/${pid}`, p.token, {})).status === 200
      && (await call('trips/confirm-acceptance', 'PUT', `${API.trips}/trips/${trip.id}/confirm-acceptance/${pid}`, d.token, {})).status === 200;
  }
  if (!ok) { tripsFailed++; await call('trips/cancel', 'PUT', `${API.trips}/trips/${trip.id}/cancel`, p.token, { reason: 'carga: no se pudo asignar' }); return; }
  // ida al recojo + viaje, GPS por lotes de 4 puntos cada ~1.2 s (tiempo comprimido; las horas de los puntos
  // van siempre hacia adelante, 250 ms entre puntos, para que el servidor no los descarte como desordenados)
  const ida = densificar(await ruta(d.pos, from)), viaje = densificar(await ruta(from, to));
  const emit = async (pts) => { for (let i = 0; i < pts.length; i += 4) { if (!running) return; const lote = pts.slice(i, i + 4).map((q, j) => ({ lat: q[0], lng: q[1], speed: Math.round(rnd(18, 28)), heading: Math.round(heading(pts[Math.max(0, i + j - 1)], q)), at: peru(new Date(Date.now() + j * 250)) })); await sendPoints(d, trip.id, lote); await sleep(1200); } };
  await emit(ida);
  await call('trips/arrived', 'PUT', `${API.trips}/trips/${trip.id}/arrived`, d.token, {});
  await sleep(500);
  if ((await call('trips/start', 'PUT', `${API.trips}/trips/${trip.id}/start`, d.token, {})).status !== 200) { tripsFailed++; return; }
  await call('trips/passenger-location', 'PUT', `${API.trips}/trips/passenger-location`, p.token, { lat: from[0], lng: from[1] });
  await emit(viaje);
  const c = await call('trips/complete', 'PUT', `${API.trips}/trips/${trip.id}/complete`, d.token, {});
  if (c.status !== 200) { tripsFailed++; return; }
  d.pos = to; tripsDone++;
  if (Math.random() < 0.7) await call('trips/ratings', 'POST', `${API.trips}/trips/ratings/${trip.id}`, p.token, { stars: Math.random() < 0.8 ? 5 : 4, comment: 'Prueba de carga' });
}

// ---------------------------------------------------------------- bucle principal
console.log(`Carga: ${Math.min(N_TRIP, passengers.length)} parejas en viaje continuo, ${Math.max(0, drivers.length - N_TRIP)} conductores conectados sin viaje, ${MINUTES} min, maximo ${MAX_TRIPS} viajes.`);
const t0 = Date.now(); const deadline = t0 + MINUTES * 60000;
const idle = drivers.slice(N_TRIP); const busy = drivers.slice(0, N_TRIP);
const idleLoop = (async () => { while (running && Date.now() < deadline) { for (const d of idle) { if (!running) break; d.pos = [d.pos[0] + rnd(-0.0005, 0.0005), d.pos[1] + rnd(-0.0005, 0.0005)]; sendPoints(d, null, [{ lat: d.pos[0], lng: d.pos[1], speed: 0, heading: 0, at: peru(new Date()) }]).catch(() => {}); await sleep(Math.max(5, 30000 / Math.max(1, idle.length))); } } })();
const workers = busy.map((d, i) => (async () => { const p = passengers[i]; if (!p) return; await sleep(i * 150); while (running && Date.now() < deadline && tripsDone + tripsFailed < MAX_TRIPS) { try { await unViaje(p, d); } catch (e) { tripsFailed++; } await sleep(rnd(500, 2000)); } })());
const reporter = (async () => { while (running && Date.now() < deadline) { await sleep(30000); const all = Object.values(lat).flat(); console.log(`  t+${Math.round((Date.now() - t0) / 1000)}s viajes=${tripsDone} fallidos=${tripsFailed} peticiones=${all.length} p95=${Math.round(pct(all, .95))}ms errores=${Object.values(errs).reduce((a, e) => a + Object.values(e).reduce((x, y) => x + y, 0), 0)}`); } })();
await Promise.all(workers); running = false; await Promise.allSettled([idleLoop, reporter]);

// ---------------------------------------------------------------- resumen
const rows = Object.entries(lat).map(([k, a]) => ({ endpoint: k, n: a.length, p50: Math.round(pct(a, .5)), p95: Math.round(pct(a, .95)), max: Math.round(Math.max(...a)), errores: errs[k] ?? {} })).sort((a, b) => b.n - a.n);
console.log('\n== Resultado'); console.log(`viajes completados=${tripsDone} fallidos=${tripsFailed} duracion=${Math.round((Date.now() - t0) / 1000)}s`);
console.table(rows.map(r => ({ ...r, errores: JSON.stringify(r.errores) })));
console.log('GPS en BD:', sql(`SELECT count(*) FROM drivers.locationhistory`), '· viajes totales:', sql(`SELECT count(*) FROM trips.trips`));
writeFileSync(new URL('./logs/carga-resultado.json', import.meta.url), JSON.stringify({ fecha: new Date().toISOString(), tripsDone, tripsFailed, rows }, null, 2));
