// =====================================================================
// Bugie - simulador de viajes EN CURSO para la demo de Monitoreo
//
// Con las 6 APIs levantadas contra bugie_test (y despues de seed.mjs), toma
// 2-3 conductores libres y pasajeros libres, crea viajes, los asigna
// (driver-accept -> confirm-driver-acceptance), los pone en curso y mueve a
// cada conductor por su ruta de GraphHopper EN TIEMPO REAL: una posicion cada
// 3 s a ~22 km/h con speedKmh y heading (PUT /drivers/location). Al llegar
// completa el viaje, el pasajero califica, y arranca otro desde donde quedo.
// Ademas, cada ~4 min un pasajero libre crea un pedido que nadie toma, para que
// en el mapa siempre haya alguien "buscando conductor" (Bugie lo cancela solo a
// los trip_no_driver_cancel_min = 10 minutos).
//
// Ctrl+C: deja todo coherente. Lo que estaba en curso se completa (el conductor
// "llega" al destino), lo aceptado sin iniciar lo cancela el conductor y los
// pedidos pendientes los cancela su pasajero. Luego termina.
//
// Uso:  node scripts/test-data/simular_viajes_en_curso.mjs [conductores=2..3]
// Variables opcionales: GRAPHHOPPER_URL (http://localhost:8989), TICK_MS (3000),
// SPEED_KMH (22), NUEVO_PEDIDO_MIN (4).
// Usuarios: los de logs/seed-resultado.json (contrasena 10203040).
// =====================================================================
import { deflateSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = {
  auth:    'http://127.0.0.1:5001/api',
  trips:   'http://127.0.0.1:5002/api',
  drivers: 'http://127.0.0.1:5003/api',
};
const GRAPHHOPPER = process.env.GRAPHHOPPER_URL ?? 'http://localhost:8989';
const PASSWORD    = '10203040';
const TICK_MS     = Number(process.env.TICK_MS ?? 3000);
const SPEED_KMH   = Number(process.env.SPEED_KMH ?? 22);
const NUEVO_PEDIDO_MS = Number(process.env.NUEVO_PEDIDO_MIN ?? 4) * 60000;
const N_DRIVERS   = Math.min(3, Math.max(2, Number(process.argv[2] ?? 2) || 2));

const hora = () => new Date().toLocaleTimeString('es-PE', { hour12: false });
const log  = (who, msg) => console.log(`${hora()} [${who}] ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ http
class HttpError extends Error {
  constructor(status, body, url) { super(`HTTP ${status} ${url} ${typeof body === 'string' ? body : JSON.stringify(body)}`); this.status = status; this.body = body; }
}
async function api(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(30000) })
    .catch(e => { throw new Error(`${method} ${url} no respondió (${e.message})`); });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* texto plano */ }
  if (!res.ok) throw new HttpError(res.status, data, `${method} ${url}`);
  return data;
}
const get  = (u, o) => api('GET', u, o);
const post = (u, o) => api('POST', u, o);
const put  = (u, o) => api('PUT', u, o);

// ------------------------------------------------------------------ png (selfie de respaldo)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td  = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function selfieBlob(key) {
  const f = join(HERE, 'logs', 'img', `selfie_${key}.png`);
  return new Blob([existsSync(f) ? readFileSync(f) : makePng(400, 400, [41, 98, 255])], { type: 'image/png' });
}

// ------------------------------------------------------------------ geo (Tacna)
const PLACES = [
  { address: 'Plaza de Armas de Tacna',                        lat: -18.0137, lng: -70.2510 },
  { address: 'Paseo Civico, Av. San Martin, Tacna',            lat: -18.0119, lng: -70.2502 },
  { address: 'Hospital Hipolito Unanue, Tacna',                lat: -18.0080, lng: -70.2455 },
  { address: 'Universidad Nacional Jorge Basadre Grohmann',     lat: -18.0255, lng: -70.2486 },
  { address: 'Aeropuerto Carlos Ciriani Santa Rosa',            lat: -18.0533, lng: -70.2758 },
  { address: 'Terminal Terrestre Collasuyo, Alto de la Alianza', lat: -17.9940, lng: -70.2420 },
  { address: 'Plaza de Pocollay',                               lat: -17.9978, lng: -70.2219 },
  { address: 'Av. Municipal, Gregorio Albarracin',              lat: -18.0420, lng: -70.2530 },
  { address: 'Ciudad Nueva, Av. Internacional',                 lat: -17.9905, lng: -70.2365 },
  { address: 'Mercado Central de Tacna',                        lat: -18.0110, lng: -70.2475 },
  { address: 'Estadio Jorge Basadre, Tacna',                    lat: -18.0062, lng: -70.2552 },
  { address: 'Av. Bolognesi 1200, Tacna',                       lat: -18.0170, lng: -70.2560 },
];
function km(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function rumbo(a, b) {
  const f1 = a.lat * Math.PI / 180, f2 = b.lat * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360);
}
const fareFor = (a, b) => Math.round((5 + 1.5 * km(a, b) * 1.3) * 2) / 2;
const azar = arr => arr[Math.floor(Math.random() * arr.length)];
// Lugar al azar distinto de `desde` y a mas de 1 km (para que el viaje se vea).
function destinoDesde(desde) {
  const lejos = PLACES.filter(p => km(p, desde) > 1);
  return azar(lejos.length ? lejos : PLACES.filter(p => p.address !== desde.address));
}

// Ruta por calles (GraphHopper); si no responde, linea recta.
const rutaCache = new Map();
async function ruta(a, b) {
  const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  if (rutaCache.has(key)) return rutaCache.get(key);
  let pts;
  try {
    const res = await fetch(`${GRAPHHOPPER}/route?point=${a.lat},${a.lng}&point=${b.lat},${b.lng}&profile=car&points_encoded=false&instructions=false`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const coords = (await res.json())?.paths?.[0]?.points?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) throw new Error('sin coordenadas');
    pts = coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (e) {
    log('GPS', `GraphHopper no responde (${e.message}): linea recta`);
    pts = Array.from({ length: 11 }, (_, i) => ({ lat: a.lat + (b.lat - a.lat) * i / 10, lng: a.lng + (b.lng - a.lng) * i / 10 }));
  }
  rutaCache.set(key, pts);
  return pts;
}
// Puntos cada `pasoKm` a lo largo de la polilinea (lo que avanza el auto en un tick).
function pasos(poly, pasoKm) {
  const out = [{ ...poly[0] }];
  let acum = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], d = km(a, b);
    if (d === 0) continue;
    let pos = 0;
    while (acum + (d - pos) >= pasoKm) {
      const falta = pasoKm - acum, t = (pos + falta) / d;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      pos += falta; acum = 0;
    }
    acum += d - pos;
  }
  out.push({ ...poly[poly.length - 1] });
  for (let i = 0; i < out.length; i++) out[i].heading = rumbo(out[Math.max(0, i - 1)], out[Math.min(out.length - 1, i + 1)]);
  return out;
}

// ------------------------------------------------------------------ usuarios
const resultado = join(HERE, 'logs', 'seed-resultado.json');
if (!existsSync(resultado)) { console.error(`No existe ${resultado}: corre primero seed.mjs`); process.exit(1); }
const usuarios = JSON.parse(readFileSync(resultado, 'utf8')).users ?? [];
const login = async email => (await post(`${API.auth}/auth/login`, { body: { email, password: PASSWORD } })).token;

let detener = false;
const pasajerosOcupados = new Set();   // keys de pasajeros en uso por el simulador
const pendientes = [];                 // { tripId, p } pedidos "buscando conductor" creados aqui
const activos = new Map();             // driverKey -> { tripId, p, estado: 'accepted'|'in_progress', to }

async function conductoresLibres() {
  const lista = [];
  for (const u of usuarios.filter(x => x.role === 'driver' && x.status === 'approved')) {
    try {
      const token = await login(u.email);
      const me = await get(`${API.drivers}/drivers/me`, { token });
      if (me.status !== 3) continue;                       // solo aprobados
      const act = await get(`${API.trips}/trips/active`, { token }).catch(() => null);
      if (act?.id) { log(u.key, `ya tiene un viaje activo (${act.id}): no se usa`); continue; }
      lista.push({ ...u, token, driverId: me.id, online: me.isOnline, pos: me.currentLat != null ? { lat: me.currentLat, lng: me.currentLng } : null });
    } catch (e) { log(u.key, `no se pudo iniciar sesion: ${e.message}`); }
  }
  return lista;
}
async function pasajerosLibres() {
  const lista = [];
  for (const u of usuarios.filter(x => x.role === 'passenger' && x.status === 'approved')) {
    try {
      const token = await login(u.email);
      const act = await get(`${API.trips}/trips/active`, { token }).catch(() => null);
      if (act?.id) { log(u.key, `ya tiene un viaje activo: no se usa`); continue; }
      lista.push({ ...u, token });
    } catch (e) { log(u.key, `no se pudo iniciar sesion: ${e.message}`); }
  }
  return lista;
}
let pasajeros = [];
function tomarPasajero() {
  const libre = pasajeros.find(p => !pasajerosOcupados.has(p.key) && !p.bloqueado);
  if (libre) pasajerosOcupados.add(libre.key);
  return libre ?? null;
}
const soltarPasajero = p => pasajerosOcupados.delete(p.key);

// ------------------------------------------------------------------ movimiento
async function ubicar(d, pt, tripId, speed) {
  await put(`${API.drivers}/drivers/location`, { token: d.token, body: { driverId: d.driverId, lat: pt.lat, lng: pt.lng, tripId, speedKmh: speed, heading: pt.heading ?? 0 } });
  d.pos = { lat: pt.lat, lng: pt.lng };
}
// Mueve al conductor de a hacia b en tiempo real. Devuelve false si hubo que parar (Ctrl+C):
// en ese caso lo deja ya en b (salta al destino) para que el viaje quede coherente.
async function mover(d, tripId, a, b, p) {
  const pasoKm = SPEED_KMH * TICK_MS / 3600000;
  const pts = pasos(await ruta(a, b), pasoKm);
  let tick = 0;
  for (const pt of pts) {
    if (detener) { await ubicar(d, pts[pts.length - 1], tripId, 0).catch(() => {}); return false; }
    const speed = Math.max(3, Math.round(SPEED_KMH + (Math.random() * 8 - 4)));
    await ubicar(d, pt, tripId, speed).catch(e => log(d.key, `location: ${e.message}`));
    // el pasajero va a bordo: cada ~30 s manda su ubicacion (es la del auto)
    if (p && tick % 10 === 0) await put(`${API.trips}/trips/passenger-location`, { token: p.token, body: { lat: pt.lat, lng: pt.lng } }).catch(() => {});
    tick++;
    await sleep(TICK_MS);
  }
  return true;
}

// Un viaje completo de un conductor: crear -> asignar -> ir al origen -> iniciar -> recorrer -> completar.
async function unViaje(d) {
  const p = tomarPasajero();
  if (!p) { log(d.key, 'no hay pasajeros libres, espero 30 s'); await sleep(30000); return; }
  const from = d.pos ? (PLACES.find(x => km(x, d.pos) < 0.3) ?? destinoDesde(d.pos)) : azar(PLACES);
  const to = destinoDesde(from);
  const D = { token: d.token }, P = { token: p.token };
  let tripId;
  try {
    const t = await post(`${API.trips}/trips`, { ...P, body: {
      originAddress: from.address, originLat: from.lat, originLng: from.lng,
      destAddress: to.address, destLat: to.lat, destLng: to.lng,
      estimatedFare: fareFor(from, to), paymentMethod: azar(['cash', 'yape', 'plin']), waypoints: [], serviceType: 0 } });
    tripId = t.id;
    const a = await post(`${API.trips}/trips/${tripId}/driver-accept`, D);
    await put(`${API.trips}/trips/${tripId}/confirm-driver-acceptance/${a.proposalId}`, P);
    activos.set(d.key, { tripId, p, estado: 'accepted', to });
    log(d.key, `viaje ${tripId.slice(0, 8)} de ${p.key}: ${from.address} -> ${to.address} (S/ ${t.estimatedFare})`);

    // ida al punto de recojo
    const llego = await mover(d, tripId, d.pos ?? from, from, null);
    if (!llego) { await put(`${API.trips}/trips/${tripId}/cancel`, { ...D, body: { reason: 'Simulacion detenida' } }).catch(() => {}); activos.delete(d.key); log(d.key, 'detenido antes de llegar: viaje cancelado por el conductor'); return; }
    await put(`${API.trips}/trips/${tripId}/arrived`, D);
    await sleep(Math.min(8000, TICK_MS * 2));
    await put(`${API.trips}/trips/${tripId}/start`, D);
    await put(`${API.trips}/trips/passenger-location`, { ...P, body: { lat: from.lat, lng: from.lng } }).catch(() => {});
    activos.set(d.key, { tripId, p, estado: 'in_progress', to });
    log(d.key, `en curso hacia ${to.address} (${km(from, to).toFixed(1)} km)`);

    const fin = await mover(d, tripId, from, to, p);
    await put(`${API.trips}/trips/${tripId}/complete`, D);
    await post(`${API.trips}/trips/ratings/${tripId}`, { ...P, body: { stars: azar([4, 5, 5, 5]) } }).catch(() => {});
    activos.delete(d.key);
    d.pos = { lat: to.lat, lng: to.lng };
    log(d.key, `viaje ${tripId.slice(0, 8)} completado${fin ? '' : ' (al detener)'}`);
  } catch (e) {
    log(d.key, `error: ${e.message}`);
    // Pasajero que no puede pedir (409: ya tiene un viaje): no se vuelve a usar
    if (!tripId && e.status === 409) { p.bloqueado = true; log(d.key, `${p.key} no puede pedir viajes: se descarta`); }
    // No dejar nada a medias: si quedo aceptado lo cancela el conductor; si esta en curso, se completa.
    const act = activos.get(d.key);
    if (tripId && act?.estado === 'in_progress') await put(`${API.trips}/trips/${tripId}/complete`, D).catch(() => {});
    else if (tripId) await put(`${API.trips}/trips/${tripId}/cancel`, { ...D, body: { reason: 'Simulacion: error' } }).catch(() => put(`${API.trips}/trips/${tripId}/cancel`, P).catch(() => {}));
    activos.delete(d.key);
    await sleep(10000);
  } finally { soltarPasajero(p); }
}

async function bucleConductor(d) {
  // Conectado y en linea (selfie + go-online) si hacia falta
  if (!d.online) {
    try {
      const f = new FormData(); f.append('faceQualityScore', '0.93'); f.append('file', selfieBlob(d.key), 'selfie.png');
      await post(`${API.drivers}/drivers/me/presence/checkin`, { token: d.token, form: f }).catch(e => { if (e.status !== 409) throw e; });
      await put(`${API.drivers}/drivers/go-online`, { token: d.token, body: d.pos ?? azar(PLACES) });
      log(d.key, 'conectado y en linea');
    } catch (e) { log(d.key, `no se pudo poner en linea: ${e.message}`); return; }
  }
  while (!detener) {
    await unViaje(d);
    if (!detener) await sleep(10000 + Math.random() * 10000);   // pausa entre viajes
  }
}

// Cada ~4 min un pasajero libre pide un viaje que nadie toma ("buscando conductor").
// Bugie lo cancela solo a los 10 min (trip_no_driver_cancel_min); si sigue vivo al
// detener, lo cancela el pasajero.
async function buclePedidos() {
  while (!detener) {
    const p = tomarPasajero();
    if (p) {
      try {
        const from = azar(PLACES), to = destinoDesde(from);
        const t = await post(`${API.trips}/trips`, { token: p.token, body: {
          originAddress: from.address, originLat: from.lat, originLng: from.lng,
          destAddress: to.address, destLat: to.lat, destLng: to.lng,
          estimatedFare: fareFor(from, to), paymentMethod: 'cash', waypoints: [], serviceType: 0 } });
        pendientes.push({ tripId: t.id, p });
        log('PEDIDO', `${p.key} busca conductor: ${from.address} -> ${to.address} (vence ${t.expiresAt ?? 'en 10 min'})`);
      } catch (e) { log('PEDIDO', `error: ${e.message}`); if (e.status === 409) p.bloqueado = true; soltarPasajero(p); }
    }
    // espera (en trozos para reaccionar a Ctrl+C) y libera a los pasajeros cuyo pedido ya se cerro
    for (let i = 0; i < NUEVO_PEDIDO_MS / 5000 && !detener; i++) {
      await sleep(5000);
      for (const x of [...pendientes]) {
        const act = await get(`${API.trips}/trips/active`, { token: x.p.token }).catch(() => undefined);
        if (act === null || (act && act.id !== x.tripId)) { pendientes.splice(pendientes.indexOf(x), 1); soltarPasajero(x.p); log('PEDIDO', `${x.p.key}: su pedido ya no esta activo (lo cancelo Bugie)`); }
      }
    }
  }
}

// ------------------------------------------------------------------ main
console.log(`Simulador de viajes en curso · ${N_DRIVERS} conductores · 1 posicion cada ${TICK_MS / 1000} s a ~${SPEED_KMH} km/h · GraphHopper ${GRAPHHOPPER}`);
console.log('Ctrl+C para detener dejando todo coherente.\n');
const libres = await conductoresLibres();
pasajeros = await pasajerosLibres();
if (libres.length < 2) { console.error(`Hacen falta al menos 2 conductores aprobados y libres (hay ${libres.length}).`); process.exit(1); }
if (pasajeros.length < 2) { console.error(`Hacen falta al menos 2 pasajeros libres (hay ${pasajeros.length}).`); process.exit(1); }
const conductores = libres.slice(0, N_DRIVERS);
log('INFO', `conductores: ${conductores.map(d => d.key).join(', ')} · pasajeros libres: ${pasajeros.map(p => p.key).join(', ')}`);

let parando = false;
process.on('SIGINT', async () => {
  if (parando) return;
  parando = true; detener = true;
  log('STOP', 'deteniendo: se completa lo que esta en curso y se cancela lo pendiente...');
  // los bucles de conductor terminan solos (mover() salta al destino); aqui los pedidos pendientes
  for (const x of pendientes) await put(`${API.trips}/trips/${x.tripId}/cancel`, { token: x.p.token, body: { reason: 'Fin de la simulacion' } }).catch(() => {});
  // espera a que los conductores cierren sus viajes (maximo 60 s) y verifica que no quede nada activo
  const fin = Date.now() + 60000;
  while (activos.size && Date.now() < fin) await sleep(1000);
  for (const [key, act] of activos) {
    const d = conductores.find(c => c.key === key);
    if (act.estado === 'in_progress') await put(`${API.trips}/trips/${act.tripId}/complete`, { token: d.token }).catch(() => {});
    else await put(`${API.trips}/trips/${act.tripId}/cancel`, { token: d.token, body: { reason: 'Fin de la simulacion' } }).catch(() => {});
  }
  log('STOP', 'listo: sin viajes del simulador abiertos.');
  process.exit(0);
});

await Promise.all([...conductores.map(d => bucleConductor(d)), buclePedidos()]);
log('INFO', 'simulador terminado');
