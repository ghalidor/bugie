// =====================================================================
// Bugie - generador de datos de prueba para bugie_test
//
// Recorre los flujos REALES por HTTP (registro -> activacion -> viajes ->
// negociacion -> pagos -> puntos -> canjes -> cupones -> sorteos -> admin).
//
// Requisitos:
//   1) bugie_test limpia (01_limpiar_bugie_test.sql)
//   2) APIs levantadas contra bugie_test (levantar_apis_test.sh)
//   3) GraphHopper local en http://localhost:8989 (rutas por calles; si no
//      responde se usa una linea recta y se registra como aviso)
//
// Uso:  node scripts/test-data/seed.mjs
//
// Correos (maximo 50 reales): antes de cada fase, los usuarios que van a
// recibir correo pasan a tener un alias del correo real
// (ghaluix+<clave>@gmail.com: Gmail lo entrega en la misma bandeja y asi
// varios usuarios pueden tenerlo a la vez, porque auth.users.email es UNIQUE).
// Al terminar la fase se espera ~10 s (el SMTP sale en segundo plano) y se
// les devuelve su @bugie.test. Se lleva un contador estimado; al llegar a 48
// las fases siguientes van directo a @bugie.test.
// =====================================================================
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const API = {
  auth:     'http://127.0.0.1:5001/api',
  trips:    'http://127.0.0.1:5002/api',
  drivers:  'http://127.0.0.1:5003/api',
  payments: 'http://127.0.0.1:5004/api',
  landing:  'http://127.0.0.1:5005/api',
  rewards:  'http://127.0.0.1:5006/api',
};
const GRAPHHOPPER = process.env.GRAPHHOPPER_URL ?? 'http://localhost:8989';
const PASSWORD   = '10203040';
const REAL_EMAIL = 'ghaluix@gmail.com';
const ADMIN      = { email: 'admin@bugie.pe', password: PASSWORD };
const PSQL       = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const DB_ARGS    = ['-h', 'localhost', '-U', 'postgres', '-d', 'bugie_test', '-tAq', '-v', 'ON_ERROR_STOP=1'];
const DB_ENV     = { ...process.env, PGPASSWORD: '147896321', PGCLIENTENCODING: 'UTF8' };

// ------------------------------------------------------------------ log
const report = [];   // { area, step, ok, detail }
function ok(area, step, detail = '')   { report.push({ area, step, ok: true,  detail }); console.log(`  ✔ [${area}] ${step}${detail ? ' — ' + detail : ''}`); }
function fail(area, step, err)         { const d = String(err?.message ?? err).slice(0, 400); report.push({ area, step, ok: false, detail: d }); console.log(`  ✘ [${area}] ${step} — ${d}`); }
function aviso(area, step, detail = '') { report.push({ area, step, ok: true, aviso: true, detail }); console.log(`  ! [${area}] ${step}${detail ? ' — ' + detail : ''}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Espera hasta que cond() sea verdadero (consulta cada `every` ms, maximo `ms`).
async function esperar(cond, ms = 150000, every = 5000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await cond()) return true; await sleep(every); }
  return !!(await cond());
}

// ------------------------------------------------------------------ sql
function sql(q) {
  return execFileSync(PSQL, [...DB_ARGS, '-c', q], { env: DB_ENV, encoding: 'utf8' }).trim();
}
// Estado de una propuesta: "status|rejectedby"
const propEstado = id => sql(`SELECT status || '|' || coalesce(rejectedby, '') FROM trips.tripproposals WHERE id = '${id}'`);
// Fila de un viaje: [status, driverid, cancelledby, cancelreason, scheduledat]
const viajeFila = id => sql(`SELECT status || '|' || coalesce(driverid::text, '') || '|' || coalesce(cancelledby, '') || '|' || coalesce(cancelreason, '') || '|' || coalesce(scheduledat::text, '') FROM trips.trips WHERE id = '${id}'`).split('|');
// Cantidad de avisos en la bandeja de un usuario con ese type (columna o data.type) para un viaje
const avisos = (userId, type, tripId) => Number(sql(`SELECT count(*) FROM trips.usernotifications WHERE userid = '${userId}' AND (type = '${type}' OR data->>'type' = '${type}')${tripId ? ` AND data->>'trip_id' = '${tripId}'` : ''}`) || 0);

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
  // Limite de 60 s: si una API se cuelga, el seed falla con la URL en vez de quedarse esperando.
  const res  = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(60000) })
    .catch(e => { throw new Error(`${method} ${url} no respondió (${e.name === 'TimeoutError' ? 'más de 60 s' : e.message})`); });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* texto plano */ }
  if (!res.ok) throw new HttpError(res.status, data, `${method} ${url.replace(/^http:\/\/localhost/, '')}`);
  return data;
}
const get  = (u, o) => api('GET', u, o);
const post = (u, o) => api('POST', u, o);
const put  = (u, o) => api('PUT', u, o);
// Espera un error HTTP concreto: { ok, got, error }
async function esperaError(promise, status) {
  try { await promise; return { ok: false, got: 200, error: 'respondió 200' }; }
  catch (e) { return { ok: e.status === status, got: e.status, error: e.body?.error ?? e.message }; }
}

// ------------------------------------------------------------------ png
// PNG simple de un color con una franja, para documentos / fotos de prueba.
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
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    const band = y > h * 0.4 && y < h * 0.6;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = band ? 255 : r; raw[o + 1] = band ? 255 : g; raw[o + 2] = band ? 255 : b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const SIGNATURE = 'data:image/png;base64,' + makePng(120, 40, [30, 30, 30]).toString('base64');

// ------------------------------------------------------------------ imagenes
// Imagenes reconocibles (avatar con iniciales, DNI, documentos, vehiculo,
// paquete, recojo, entrega). Las dibuja generar_imagenes.ps1 al inicio.
const IMG_DIR = join(HERE, 'logs', 'img');
const COLORS  = ['#2962FF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#0EA5E9', '#F97316', '#6366F1', '#84CC16'];
const imgManifest = [];
function addImg(file, kind, title, extra = {}) { imgManifest.push({ file, kind, title, subtitle: '', initials: '', extra: '', color: '#2962FF', ...extra }); }
function imgBlob(file) { return new Blob([readFileSync(join(IMG_DIR, file))], { type: 'image/png' }); }
const initialsOf = name => name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const shortName  = name => name.split(' ').slice(0, 2).join(' ');
function form(fields, files = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.append(k, String(v));
  for (const [k, list] of Object.entries(files)) for (const [blob, name] of list) f.append(k, blob, name);
  return f;
}

// ------------------------------------------------------------------ geo (Tacna)
const PLACES = {
  plaza:     { address: 'Plaza de Armas de Tacna',                      lat: -18.0137, lng: -70.2510 },
  paseo:     { address: 'Paseo Civico, Av. San Martin, Tacna',          lat: -18.0119, lng: -70.2502 },
  hospital:  { address: 'Hospital Hipolito Unanue, Tacna',              lat: -18.0080, lng: -70.2455 },
  unjbg:     { address: 'Universidad Nacional Jorge Basadre Grohmann',   lat: -18.0255, lng: -70.2486 },
  aeropuerto:{ address: 'Aeropuerto Carlos Ciriani Santa Rosa',          lat: -18.0533, lng: -70.2758 },
  terminal:  { address: 'Terminal Terrestre Collasuyo, Alto de la Alianza', lat: -17.9940, lng: -70.2420 },
  pocollay:  { address: 'Plaza de Pocollay',                             lat: -17.9978, lng: -70.2219 },
  albarr:    { address: 'Av. Municipal, Gregorio Albarracin',            lat: -18.0420, lng: -70.2530 },
  ciudadN:   { address: 'Ciudad Nueva, Av. Internacional',               lat: -17.9905, lng: -70.2365 },
  mercado:   { address: 'Mercado Central de Tacna',                      lat: -18.0110, lng: -70.2475 },
  estadio:   { address: 'Estadio Jorge Basadre, Tacna',                  lat: -18.0062, lng: -70.2552 },
  bolognesi: { address: 'Av. Bolognesi 1200, Tacna',                     lat: -18.0170, lng: -70.2560 },
};
function km(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Rumbo (grados 0-360) de a hacia b
function rumbo(a, b) {
  const f1 = a.lat * Math.PI / 180, f2 = b.lat * Math.PI / 180, dl = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360);
}
// base_fare 5.00 + fare_per_km 1.50 (landing.systemsettings), redondeado a 0.50
const fareFor = (a, b) => Math.round((5 + 1.5 * km(a, b) * 1.3) * 2) / 2;
// Linea con una leve curva (respaldo si GraphHopper no responde)
function route(a, b, n = 10) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, bend = Math.sin(t * Math.PI) * 0.0025;
    return { lat: a.lat + (b.lat - a.lat) * t + bend, lng: a.lng + (b.lng - a.lng) * t - bend };
  });
}
// Ruta por calles con GraphHopper (profile car). Cache en memoria por par de puntos.
// Si GraphHopper no responde cae a la linea recta y lo deja como aviso (no fail).
const rutaCache = new Map();
let ghAvisado = false;
async function ruta(a, b) {
  const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  if (rutaCache.has(key)) return rutaCache.get(key);
  let pts, real = true;
  try {
    const url = `${GRAPHHOPPER}/route?point=${a.lat},${a.lng}&point=${b.lat},${b.lng}&profile=car&points_encoded=false&instructions=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const coords = j?.paths?.[0]?.points?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) throw new Error('sin coordenadas');
    pts = coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (e) {
    real = false;
    pts = route(a, b, 10);
    if (!ghAvisado) { aviso('GPS', 'GraphHopper no responde: se usa linea recta', `${GRAPHHOPPER} · ${e.message}`); ghAvisado = true; }
  }
  const r = { pts, real };
  rutaCache.set(key, r);
  return r;
}
// Recorre la polilinea y deja ~1 punto cada 80-120 m, con el rumbo de cada tramo.
function densificar(poly) {
  const out = [{ ...poly[0] }];
  let paso = 0.08 + Math.random() * 0.04, acum = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], d = km(a, b);
    if (d === 0) continue;
    let pos = 0;
    while (acum + (d - pos) >= paso) {
      const falta = paso - acum, t = (pos + falta) / d;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      pos += falta; acum = 0; paso = 0.08 + Math.random() * 0.04;
    }
    acum += d - pos;
  }
  const fin = poly[poly.length - 1];
  if (km(out[out.length - 1], fin) > 0.02) out.push({ ...fin });
  for (let i = 0; i < out.length; i++) out[i].heading = rumbo(out[Math.max(0, i - 1)], out[Math.min(out.length - 1, i + 1)]);
  return out;
}
async function rutaDensa(a, b) {
  const r = await ruta(a, b);
  return { pts: densificar(r.pts), km: r.pts.reduce((s, p, i) => i ? s + km(r.pts[i - 1], p) : 0, 0), real: r.real };
}

// ------------------------------------------------------------------ correos reales (maximo 50)
const MAX_CORREOS  = 50;   // nunca mas de esto
const TOPE_CORREOS = 48;   // al llegar aqui, las fases siguientes van a @bugie.test
const correos = { estimados: 0, detalle: [] };
const conCorreoReal = new Set();   // userIds que ahora mismo tienen el alias real
// Alias del correo real por usuario (Gmail entrega ghaluix+p1@gmail.com en la misma bandeja).
const aliasReal = key => REAL_EMAIL.replace('@', `+${String(key).toLowerCase()}@`);
function ponerCorreoReal(users, esperados) {
  const lista = users.filter(u => u?.userId);
  if (!lista.length) return [];
  if (correos.estimados >= TOPE_CORREOS || correos.estimados + esperados > MAX_CORREOS) {
    aviso('Correos', `tope de correos reales alcanzado (${correos.estimados}): esta fase va a @bugie.test`);
    return [];
  }
  for (const u of lista) {
    u.currentEmail = aliasReal(u.key);
    sql(`UPDATE auth.users SET email = '${u.currentEmail}' WHERE id = '${u.userId}'`);
    conCorreoReal.add(u.userId);
  }
  return lista;
}
function devolverCorreos(users) {
  for (const u of users) {
    if (!u?.userId || u.currentEmail === u.email) continue;
    sql(`UPDATE auth.users SET email = '${u.email}' WHERE id = '${u.userId}'`);
    u.currentEmail = u.email;
    conCorreoReal.delete(u.userId);
  }
}
// Registra un correo que el backend acaba de enviar a ese usuario (solo cuenta si tenia el alias real).
function correo(u, motivo) {
  if (!u?.userId || !conCorreoReal.has(u.userId)) return false;
  correos.estimados++; correos.detalle.push(`${u.key}: ${motivo}`);
  return true;
}
// Correo que va directo a REAL_EMAIL (contacto web, libro de reclamaciones, invitacion).
function correoDirecto(motivo) { correos.estimados++; correos.detalle.push(`directo: ${motivo}`); }
const puedeCorreoDirecto = () => correos.estimados < TOPE_CORREOS;
// Ejecuta una fase con los usuarios indicados con correo real; al final espera 10 s
// (el SMTP sale en segundo plano) y les devuelve su @bugie.test.
async function faseConCorreo(users, esperados, fn) {
  const lista = ponerCorreoReal(users, esperados);
  try { return await fn(lista.length > 0); }
  finally { if (lista.length) { await sleep(10000); devolverCorreos(lista); } }
}

// ------------------------------------------------------------------ users
async function login(email) {
  const r = await post(`${API.auth}/auth/login`, { body: { email, password: PASSWORD } });
  return r.token;
}
const loginUser = u => login(u.currentEmail ?? u.email);

// Documento de identidad de prueba: DNI = '4' + ultimos 7 digitos del celular
// (es el que sale dibujado en las imagenes del DNI). Unico por usuario.
const dniOf = (phone) => '4' + phone.slice(-7);

async function registerUser(u, role, referralCode) {
  // El registro se hace con el alias del correo real -> llega el correo de bienvenida
  // (salvo que ya se haya llegado al tope de correos).
  const real = correos.estimados < TOPE_CORREOS;
  const email = real ? aliasReal(u.key) : u.email;
  const r = await post(`${API.auth}/auth/register`, { body: {
    email, password: PASSWORD, phone: u.phone, role,
    docType: 'DNI', docNumber: dniOf(u.phone),
    firstNames: u.fn, lastNamePaternal: u.regAp ?? u.ap, lastNameMaternal: u.am ?? null,
    acceptedTerms: true, signatureImage: SIGNATURE, referralCode,
  } });
  u.userId = r.userId; u.token = r.token; u.role = role; u.currentEmail = email;
  if (real) conCorreoReal.add(u.userId);
  correo(u, 'bienvenida');
  ok('Registro', `${role} ${u.name}`, `correo de bienvenida a ${email}${referralCode ? `, referido con ${referralCode}` : ''}`);
}

// ------------------------------------------------------------------ data
// fn = nombres, ap = apellido paterno, am = apellido materno (opcional).
// name = como queda el FullName ("Nombres Paterno Materno").
const passengers = [
  { key: 'P1', name: 'Lucia Mamani Quispe',     fn: 'Lucia',          ap: 'Mamani',  am: 'Quispe',   phone: '952100101', email: 'lucia.mamani@bugie.test',    status: 'approved' },
  { key: 'P2', name: 'Carlos Ticona Flores',    fn: 'Carlos',         ap: 'Ticona',  am: 'Flores',   phone: '952100102', email: 'carlos.ticona@bugie.test',   status: 'approved', referredBy: 'P1' },
  { key: 'P3', name: 'Maria Fernanda Choque',   fn: 'Maria Fernanda', ap: 'Choque',                  phone: '952100103', email: 'maria.choque@bugie.test',    status: 'approved' },
  { key: 'P4', name: 'Jorge Luis Apaza',        fn: 'Jorge Luis',     ap: 'Apaza',                   phone: '952100104', email: 'jorge.apaza@bugie.test',     status: 'approved' },
  // regAp: se registra con el apellido mal escrito y el admin lo corrige con motivo
  { key: 'P5', name: 'Rosa Elena Condori',      fn: 'Rosa Elena',     ap: 'Condori', regAp: 'Condory', phone: '952100105', email: 'rosa.condori@bugie.test',    status: 'approved' },
  { key: 'P6', name: 'Diego Huanca Rivera',     fn: 'Diego',          ap: 'Huanca',  am: 'Rivera',   phone: '952100106', email: 'diego.huanca@bugie.test',    status: 'rejected' },
  { key: 'P7', name: 'Ana Paredes Coaquira',    fn: 'Ana',            ap: 'Paredes', am: 'Coaquira', phone: '952100107', email: 'ana.paredes@bugie.test',     status: 'pending' },
  // Cuenta eliminada por el propio pasajero (estado "Eliminada" en el admin)
  { key: 'P8', name: 'Sofia Ramos Ticona',      fn: 'Sofia',          ap: 'Ramos',   am: 'Ticona',   phone: '952100108', email: 'sofia.ramos@bugie.test',     status: 'deleted' },
];
const drivers = [
  { key: 'D1', name: 'Juan Carlos Pari Vargas', fn: 'Juan Carlos',  ap: 'Pari',    am: 'Vargas',  phone: '953200201', email: 'juan.pari@bugie.test',    status: 'approved', vehicle: { plate: 'Z1A-101', brand: 'Toyota',  model: 'Yaris',  year: 2019, color: 'Blanco' }, at: PLACES.plaza },
  { key: 'D2', name: 'Miguel Angel Cutipa',     fn: 'Miguel Angel', ap: 'Cutipa',                 phone: '953200202', email: 'miguel.cutipa@bugie.test', status: 'approved', vehicle: { plate: 'Z2B-202', brand: 'Hyundai', model: 'Accent', year: 2020, color: 'Plata'  }, at: PLACES.hospital },
  { key: 'D3', name: 'Pedro Mendoza Calle',     fn: 'Pedro',        ap: 'Mendoza', am: 'Calle',   phone: '953200203', email: 'pedro.mendoza@bugie.test', status: 'approved', vehicle: { plate: 'Z3C-303', brand: 'Kia',     model: 'Rio',    year: 2021, color: 'Rojo'   }, at: PLACES.unjbg, referredBy: 'P1' },
  { key: 'D4', name: 'Raul Ccama Limachi',      fn: 'Raul',         ap: 'Ccama',   am: 'Limachi', phone: '953200204', email: 'raul.ccama@bugie.test',    status: 'pending',  vehicle: { plate: 'Z4D-404', brand: 'Suzuki',  model: 'Swift',  year: 2018, color: 'Azul'   }, at: PLACES.terminal },
  // Registro completo que el admin RECHAZA al final; luego pide revision (queda ABIERTA)
  { key: 'D5', name: 'Hugo Flores Quispe',      fn: 'Hugo',         ap: 'Flores',  am: 'Quispe',  phone: '953200205', email: 'hugo.flores@bugie.test',   status: 'rejected', vehicle: { plate: 'Z5E-505', brand: 'Nissan',  model: 'Sentra', year: 2017, color: 'Negro'  }, at: PLACES.ciudadN },
];
const byKey = Object.fromEntries([...passengers, ...drivers].map(u => [u.key, u]));
const aprobados = () => [...passengers, ...drivers].filter(u => u.status === 'approved' && u.token);
let adminToken;

const DRIVER_DOCS = ['dni_front', 'dni_back', 'license', 'soat', 'tarjeta_propiedad', 'revision_tecnica', 'certificado_unico_laboral'];
const WITH_EXPIRY = new Set(['license', 'soat', 'revision_tecnica']);
const inOneYear = () => new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

const DOC_TITLE = {
  dni_front: 'DNI - Frente', dni_back: 'DNI - Reverso', license: 'Licencia de conducir', soat: 'SOAT',
  tarjeta_propiedad: 'Tarjeta de propiedad', revision_tecnica: 'Revision tecnica', certificado_unico_laboral: 'Certificado Unico Laboral',
};
const VEHICLE_COLOR = { Blanco: '#F5F5F5', Plata: '#C0C0C0', Rojo: '#DC2626', Azul: '#2563EB', Negro: '#111827' };

// Arma la lista de imagenes de todos los usuarios y envios, y las dibuja.
function generarImagenes() {
  [...passengers, ...drivers].forEach((u, i) => {
    const color = COLORS[i % COLORS.length];
    const ini = initialsOf(u.name);
    const dni = dniOf(u.phone);
    addImg(`avatar_${u.key}.png`, 'avatar', shortName(u.name), { initials: ini, color });
    const docs = u.vehicle ? DRIVER_DOCS : ['dni_front', 'dni_back'];
    for (const doc of docs) {
      const extra = doc.startsWith('dni') ? dni : (u.vehicle && ['soat', 'tarjeta_propiedad', 'revision_tecnica'].includes(doc) ? u.vehicle.plate : `Q-${dni}`);
      addImg(`${doc}_${u.key}.png`, 'card', DOC_TITLE[doc], { subtitle: u.name, initials: ini, extra, color });
    }
    if (u.vehicle) {
      const v = u.vehicle;
      // Tres fotos del vehiculo: frente, costado y placa (obligatorias)
      const vColor = VEHICLE_COLOR[v.color] ?? '#9CA3AF';
      addImg(`vehiculo_${u.key}.png`, 'vehicle', `Frente - ${v.brand} ${v.model} ${v.year}`, { subtitle: u.name, extra: v.plate, color: vColor });
      addImg(`vehiculo_costado_${u.key}.png`, 'vehicle_side', `Costado - ${v.brand} ${v.model}`, { subtitle: u.name, extra: v.plate, color: vColor });
      addImg(`vehiculo_placa_${u.key}.png`, 'vehicle_plate', 'Placa', { subtitle: `${v.brand} ${v.model}`, extra: v.plate, color: vColor });
      addImg(`selfie_${u.key}.png`, 'avatar', 'Selfie de conexión', { initials: ini, color });
    }
  });
  [...TRIPS_A, ...TRIPS_B, ...TRIPS_FINAL].filter(s => s.delivery).forEach((s, i) => {
    s.img = i;
    const rec = s.recipient ?? 'Recepcion del destino';
    addImg(`paquete1_${i}.png`, 'package', 'Foto del paquete (1)', { subtitle: s.delivery });
    addImg(`paquete2_${i}.png`, 'package', 'Foto del paquete (2)', { subtitle: s.delivery });
    addImg(`recojo_${i}.png`, 'photo', 'Paquete recogido', { subtitle: `${s.delivery} - verificado por el conductor`, color: '#2563EB' });
    addImg(`recojo2_${i}.png`, 'photo', 'Recojo (foto adicional)', { subtitle: 'Paquete recibido sellado', color: '#0EA5E9' });
    addImg(`entrega_${i}.png`, 'photo', 'Entrega confirmada', { subtitle: `Recibio: ${rec}`, color: '#10B981' });
  });
  mkdirSync(IMG_DIR, { recursive: true });
  const manifest = join(IMG_DIR, 'manifiesto.json');
  writeFileSync(manifest, JSON.stringify(imgManifest), 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'generar_imagenes.ps1'), manifest, IMG_DIR], { stdio: 'inherit' });
  ok('Imagenes', `${imgManifest.length} imagenes de prueba generadas`, IMG_DIR);
}

// ================================================================== fases
async function faseAdmin() {
  console.log('\n== Admin');
  adminToken = await login(ADMIN.email);
  ok('Admin', 'login admin@bugie.pe');
  // El admin principal es una cuenta antigua: completa una vez su documento y
  // nombres separados (409 = ya estaban completos de una corrida anterior).
  try {
    await put(`${API.auth}/auth/me/profile-completion`, { token: adminToken, body: {
      docType: 'DNI', docNumber: '40000000', firstNames: 'Administrador', lastNamePaternal: 'Bugie', lastNameMaternal: null } });
    ok('Admin', 'completa documento y nombres del admin principal');
  } catch (e) {
    if (e.status === 409) ok('Admin', 'documento y nombres del admin principal ya estaban completos');
    else fail('Admin', 'completar perfil del admin principal', e);
  }
  try {
    const cat = await get(`${API.auth}/auth/admin/security/permissions/catalog`, { token: adminToken });
    const all = [...(cat.views ?? []), ...(cat.actions ?? [])].map(p => typeof p === 'string' ? p : (p.key ?? p.code ?? p.id));
    const perms = all.filter(p => /dashboard|passenger|driver|trip|monitor|sos|incident|contact/i.test(p));
    const role = await post(`${API.auth}/auth/admin/security/roles`, { token: adminToken, body: {
      name: 'soporte', description: 'Soporte y monitoreo (prueba)', permissions: perms } });
    ok('Admin', 'crear rol "soporte"', `${perms.length} permisos`);
    await post(`${API.auth}/auth/admin/security/users`, { token: adminToken, body: {
      email: 'soporte@bugie.test', password: PASSWORD, phone: '951000001', roleId: role.id,
      docType: 'DNI', docNumber: dniOf('951000001'), firstNames: 'Soporte', lastNamePaternal: 'Bugie', lastNameMaternal: null } });
    ok('Admin', 'crear admin soporte@bugie.test');
  } catch (e) { fail('Admin', 'rol/usuario soporte', e); }
  // Parametros de negociacion que usa el seed (deben estar en sus valores por defecto)
  try {
    const s = await get(`${API.landing}/landing/settings`);
    const v = k => s.find(x => x.settingKey === k)?.value;
    ok('Admin', 'settings de negociacion', `base_fare=${v('base_fare')} fare_max_multiplier=${v('fare_max_multiplier')} trip_no_driver_cancel_min=${v('trip_no_driver_cancel_min')} driver_confirm_immediate_min=${v('driver_confirm_immediate_min')}`);
    if (v('trip_no_driver_cancel_min') !== '10' || v('driver_confirm_immediate_min') !== '2') {
      await put(`${API.landing}/landing/settings/trip_no_driver_cancel_min`, { token: adminToken, body: { value: '10' } });
      await put(`${API.landing}/landing/settings/driver_confirm_immediate_min`, { token: adminToken, body: { value: '2' } });
      aviso('Admin', 'settings de negociacion restaurados a 10 / 2 (quedaron cambiados de una corrida anterior)');
    }
  } catch (e) { fail('Admin', 'leer settings de negociacion', e); }
}

async function faseRewardsConfig() {
  console.log('\n== Configuracion de rewards');
  const T = { token: adminToken };
  try {
    await put(`${API.rewards}/rewards/admin/settings/coupons_apply_to_fare`, { ...T, body: { value: 'true' } });
    const s = await get(`${API.rewards}/rewards/admin/settings`, T).catch(() => null);
    const v = Array.isArray(s) ? s.find(x => (x.key ?? x.settingKey) === 'coupons_apply_to_fare')?.value : null;
    if (v && String(v) !== 'true') fail('Rewards', 'coupons_apply_to_fare', `quedo en ${v}`);
    else ok('Rewards', 'activar cupones en tarifa (coupons_apply_to_fare = true)');
  }
  catch (e) { fail('Rewards', 'activar cupones en tarifa', e); }
  const now = Date.now();
  const promos = [
    { name: 'Doble puntos de lanzamiento', description: 'Todos los viajes suman el doble de puntos.', promotionType: 'multiplier', targetUserType: 'both',
      multiplierValue: 2, bonusPoints: 0, startDate: new Date(now - 40 * 864e5).toISOString(), endDate: new Date(now + 30 * 864e5).toISOString(), isActive: true, firstTripOfDay: false },
    { name: 'Bono primer viaje del dia', description: '+50 puntos en tu primer viaje del dia.', promotionType: 'bonus_points', targetUserType: 'passenger',
      multiplierValue: 1, bonusPoints: 50, startDate: new Date(now - 40 * 864e5).toISOString(), endDate: new Date(now + 60 * 864e5).toISOString(), isActive: true, firstTripOfDay: true },
    { name: 'Yape suma mas (conductores)', description: '+30 puntos por viaje pagado con Yape.', promotionType: 'bonus_points', targetUserType: 'driver',
      multiplierValue: 1, bonusPoints: 30, startDate: new Date(now - 40 * 864e5).toISOString(), endDate: new Date(now + 60 * 864e5).toISOString(), isActive: true, firstTripOfDay: false, paymentMethods: ['yape'] },
    { name: 'Fiestas Patrias (finalizada)', description: 'Promocion historica, ya inactiva.', promotionType: 'multiplier', targetUserType: 'both',
      multiplierValue: 3, bonusPoints: 0, startDate: new Date(now - 90 * 864e5).toISOString(), endDate: new Date(now - 60 * 864e5).toISOString(), isActive: false, firstTripOfDay: false },
  ];
  for (const p of promos) {
    try { await post(`${API.rewards}/rewards/admin/promotions`, { ...T, body: p }); ok('Rewards', `promocion "${p.name}"`); }
    catch (e) { fail('Rewards', `promocion "${p.name}"`, e); }
  }
  const raffles = [
    { name: 'Sorteo mensual: 1 mes de viajes gratis', raffleType: 'monthly', prizeDescription: 'S/ 200 en viajes Bugie', prizeValue: 200,
      drawDate: new Date(now + 20 * 864e5).toISOString(), targetUserType: 'passenger', winnersCount: 1, open: true },
    { name: 'Sorteo semanal conductores: kit de mantenimiento', raffleType: 'weekly', prizeDescription: 'Cambio de aceite + lavado', prizeValue: 120,
      drawDate: new Date(now + 5 * 864e5).toISOString(), targetUserType: 'driver', winnersCount: 1, open: true },
    { name: 'Sorteo especial aniversario', raffleType: 'special', prizeDescription: 'Smartphone gama media', prizeValue: 900,
      drawDate: new Date(now + 25 * 864e5).toISOString(), targetUserType: 'both', winnersCount: 2, open: true },
  ];
  const created = [];
  for (const r of raffles) {
    try { const x = await post(`${API.rewards}/rewards/admin/raffles`, { ...T, body: r }); created.push(x); ok('Rewards', `sorteo "${r.name}"`); }
    catch (e) { fail('Rewards', `sorteo "${r.name}"`, e); }
  }
  return created;
}

async function fasePasajeros() {
  console.log('\n== Pasajeros: registro -> documentos -> activacion');
  // Toda la fase con el alias del correo real (bienvenida, cuenta activa, rechazo, cuenta eliminada).
  for (const p of passengers) {
    try {
      const ref = p.referredBy ? byKey[p.referredBy].referralCode : undefined;
      await registerUser(p, 'passenger', ref);
      for (const docType of ['dni_front', 'dni_back']) {
        const d = await post(`${API.auth}/auth/passengers/documents`, { token: p.token, form: form({ docType }, { file: [[imgBlob(`${docType}_${p.key}.png`), `${docType}.png`]] }) });
        (p.docs ??= []).push(d.id);
      }
      ok('Pasajero', `${p.key} sube DNI (frente y reverso)`);
      await post(`${API.auth}/auth/me/profile-photo`, { token: p.token, form: form({}, { file: [[imgBlob(`avatar_${p.key}.png`), 'perfil.png']] }) })
        .then(() => ok('Pasajero', `${p.key} sube foto de perfil`)).catch(e => fail('Pasajero', `${p.key} foto de perfil`, e));
      const T = { token: adminToken };
      if (p.status === 'approved') {
        for (const id of p.docs) await put(`${API.auth}/auth/passengers/documents/${id}/approve`, T);
        await put(`${API.auth}/auth/admin/passengers/${p.userId}/approve`, T);
        correo(p, 'cuenta activa');
        ok('Pasajero', `${p.key} activado por admin`, `correo "cuenta activa" a ${p.currentEmail}`);
        if (p.regAp) {
          // Correccion de nombres por el admin (queda en la auditoria de la cuenta)
          try {
            const r = await put(`${API.auth}/auth/admin/users/${p.userId}/names`, { ...T, body: {
              firstNames: p.fn, lastNamePaternal: p.ap, lastNameMaternal: p.am ?? null,
              reason: `El apellido paterno estaba mal escrito (${p.regAp}); se corrige según su DNI.` } });
            if (r?.fullName === p.name) ok('Cuenta', `admin corrige nombres de ${p.key}`, `${p.fn} ${p.regAp} -> ${r.fullName}`);
            else fail('Cuenta', `corregir nombres de ${p.key}`, `quedo "${r?.fullName}"`);
          } catch (e) { fail('Cuenta', `corregir nombres de ${p.key}`, e); }
        }
      } else if (p.status === 'rejected') {
        await put(`${API.auth}/auth/passengers/documents/${p.docs[0]}/reject`, { ...T, body: { reason: 'La foto del DNI esta borrosa' } });
        await put(`${API.auth}/auth/admin/passengers/${p.userId}/reject`, { ...T, body: { reason: 'DNI ilegible, vuelve a subirlo' } });
        correo(p, 'rechazo de documentos');
        ok('Pasajero', `${p.key} rechazado por admin`, `correo "vuelve a subir documentos" a ${p.currentEmail}`);
      } else if (p.status === 'deleted') {
        // Elimina su cuenta desde la app -> llega "tu cuenta fue eliminada"
        await post(`${API.auth}/auth/me/delete-account`, { token: p.token, body: { password: PASSWORD, reason: 'Ya no uso la aplicacion' } });
        correo(p, 'cuenta eliminada');
        ok('Pasajero', `${p.key} elimina su cuenta`, `correo "cuenta eliminada" a ${p.currentEmail}`);
        continue; // una cuenta eliminada ya no puede iniciar sesion
      } else ok('Pasajero', `${p.key} queda pendiente de revision`);
      p.token = await loginUser(p);
      if (p.status === 'approved') {
        try { const r = await get(`${API.rewards}/rewards/me/referral`, { token: p.token }); p.referralCode = r.code; }
        catch (e) { fail('Rewards', `codigo de referido ${p.key}`, e); }
      }
    } catch (e) { fail('Pasajero', `${p.key} ${p.name}`, e); }
  }
  // Fin de fase: un solo sleep para que salga el SMTP y se devuelven los @bugie.test
  await sleep(10000);
  devolverCorreos(passengers);
}

// Conexion del conductor: selfie (check-in) y luego "en linea" en su punto de partida.
async function connectDriver(d, score) {
  await post(`${API.drivers}/drivers/me/presence/checkin`, { token: d.token, form: form({ faceQualityScore: score }, { file: [[imgBlob(`selfie_${d.key}.png`), 'selfie.png']] }) });
  await put(`${API.drivers}/drivers/go-online`, { token: d.token, body: d.pos ?? d.at });
}

// Fechas de Peru (UTC-5) en formato yyyy-MM-dd
const peruToday = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays   = (s, n) => { const x = new Date(s + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isWeekend = s => [0, 6].includes(new Date(s + 'T12:00:00Z').getUTCDay());

async function faseConductores() {
  console.log('\n== Conductores: registro -> documentos -> vehiculo -> activacion');
  for (const d of drivers) {
    try {
      const ref = d.referredBy ? byKey[d.referredBy].referralCode : undefined;
      await registerUser(d, 'driver', ref);
      const me = await get(`${API.drivers}/drivers/me`, { token: d.token });
      d.driverId = me.id;
      d.docs = {};
      for (const docType of DRIVER_DOCS) {
        const fields = { docType, expiresAt: WITH_EXPIRY.has(docType) ? inOneYear() : undefined };
        const r = await post(`${API.drivers}/drivers/documents`, { token: d.token, form: form(fields, { file: [[imgBlob(`${docType}_${d.key}.png`), `${docType}.png`]] }) });
        d.docs[docType] = r.id;
      }
      ok('Conductor', `${d.key} sube ${DRIVER_DOCS.length} documentos`);
      // Alta del vehiculo con sus tres fotos (frente, costado y placa)
      await post(`${API.drivers}/drivers/vehicles/with-photos`, { token: d.token, form: form(d.vehicle, {
        photoFront: [[imgBlob(`vehiculo_${d.key}.png`), 'frente.png']],
        photoSide:  [[imgBlob(`vehiculo_costado_${d.key}.png`), 'costado.png']],
        photoPlate: [[imgBlob(`vehiculo_placa_${d.key}.png`), 'placa.png']],
      }) });
      await post(`${API.drivers}/drivers/profile/me/photo`, { token: d.token, form: form({}, { file: [[imgBlob(`avatar_${d.key}.png`), 'perfil.png']] }) }).catch(e => fail('Conductor', `${d.key} foto de perfil`, e));
      // La foto de la cuenta (Auth) es la que se muestra en los avatares de web y app
      await post(`${API.auth}/auth/me/profile-photo`, { token: d.token, form: form({}, { file: [[imgBlob(`avatar_${d.key}.png`), 'perfil.png']] }) }).catch(e => fail('Conductor', `${d.key} foto de cuenta`, e));
      ok('Conductor', `${d.key} registra vehiculo ${d.vehicle.brand} ${d.vehicle.model} ${d.vehicle.plate} con 3 fotos`);
      try { await put(`${API.drivers}/drivers/submit-review`, { token: d.token }); ok('Conductor', `${d.key} envia a revision`); }
      catch (e) { fail('Conductor', `${d.key} submit-review`, e); }

      const T = { token: adminToken };
      if (d.status === 'approved') {
        for (const id of Object.values(d.docs)) await put(`${API.drivers}/drivers/documents/${id}/approve`, T);
        await put(`${API.drivers}/drivers/${d.driverId}/approve`, T);
        correo(d, 'conductor activado');
        ok('Conductor', `${d.key} documentos aprobados y conductor activado`, `correo "cuenta activa" a ${d.currentEmail}`);
      } else if (d.status === 'pending') {
        await put(`${API.drivers}/drivers/documents/${d.docs.soat}/reject`, { ...T, body: { reason: 'SOAT vencido en la foto, sube el vigente' } });
        ok('Conductor', `${d.key} queda en revision con SOAT rechazado`);
      } else ok('Conductor', `${d.key} queda en revision (el admin lo rechaza al final)`);
      d.token = await loginUser(d);

      if (d.status === 'approved') {
        // Historial de conexiones: 4 turnos cerrados (selfie -> en linea -> fuera de linea -> cierre).
        // 03_repartir_fechas.sql los pone en dias con viajes de ese conductor.
        let turnos = 0;
        for (let i = 0; i < 4; i++) {
          try {
            await connectDriver(d, (0.86 + i * 0.03).toFixed(2));
            await put(`${API.drivers}/drivers/go-offline`, { token: d.token });
            await post(`${API.drivers}/drivers/me/presence/checkout`, { token: d.token });
            turnos++;
          } catch (e) { fail('Conexion', `${d.key} turno ${i + 1}`, e); break; }
        }
        if (turnos) ok('Conexion', `${d.key} ${turnos} conexiones cerradas`, 'selfie + en linea + desconexion');
        // Conexion actual (queda activa): en linea para recibir viajes
        await connectDriver(d, '0.93');
        ok('Conductor', `${d.key} selfie de conexion + en linea en ${d.at.address}`);
      }
    } catch (e) { fail('Conductor', `${d.key} ${d.name}`, e); }
  }
  await sleep(10000);
  devolverCorreos(drivers);
}

// ------------------------------------------------------------------ viajes
const tripsLog = [];
// Programados: hora de Peru (UTC-5) de manana a las hh:mm, sin zona
// (las APIs toman una fecha sin zona como hora de Peru).
function tomorrowPeru(hh, mm = 0) {
  const peru = new Date(Date.now() - 5 * 3600 * 1000 + 24 * 3600 * 1000);
  const p2 = n => String(n).padStart(2, '0');
  return `${peru.getUTCFullYear()}-${p2(peru.getUTCMonth() + 1)}-${p2(peru.getUTCDate())}T${p2(hh)}:${p2(mm)}:00`;
}
// El conductor recorre la ruta por calles de a hasta b mandando su posicion con
// los endpoints reales (PUT /drivers/location con speedKmh y heading). `fraccion`
// < 1 deja el recorrido a medias (viaje EN CURSO). Actualiza d.pos.
// El endpoint no acepta hora: 03_repartir_fechas.sql reparte despues las horas
// de los puntos de forma coherente con la duracion del viaje (~22 km/h).
async function pingPath(d, tripId, a, b, fraccion = 1) {
  const r = await rutaDensa(a, b);
  const n = Math.max(1, Math.ceil(r.pts.length * fraccion));
  for (let i = 0; i < n; i++) {
    const pt = r.pts[i];
    const speed = i === 0 || i === r.pts.length - 1 ? 4 + Math.round(Math.random() * 4) : 19 + Math.round(Math.random() * 6);
    await put(`${API.drivers}/drivers/location`, { token: d.token, body: { driverId: d.driverId, lat: pt.lat, lng: pt.lng, tripId, speedKmh: speed, heading: pt.heading } });
    d.pos = { lat: pt.lat, lng: pt.lng };
  }
  return { puntos: n, km: Math.round(r.km * 100) / 100, real: r.real };
}

// Cuerpo de un viaje inmediato entre dos lugares.
function cuerpoViaje(from, to, extra = {}) {
  return {
    originAddress: from.address, originLat: from.lat, originLng: from.lng,
    destAddress: to.address, destLat: to.lat, destLng: to.lng,
    estimatedFare: fareFor(from, to), paymentMethod: 'cash', waypoints: [], serviceType: 0, ...extra,
  };
}
const crearViaje = (p, from, to, extra) => post(`${API.trips}/trips`, { token: p.token, body: cuerpoViaje(from, to, extra) });

// Conductor asignado: va al origen, avisa llegada, inicia, recorre la ruta y completa.
async function completarViaje(p, d, tripId, from, to, label, s = {}) {
  const P = { token: p.token }, D = { token: d.token };
  const ida = await pingPath(d, tripId, d.pos ?? d.at, from);
  await put(`${API.trips}/trips/${tripId}/arrived`, D);
  await put(`${API.trips}/trips/${tripId}/start`, D);
  await put(`${API.trips}/trips/passenger-location`, { ...P, body: { lat: from.lat, lng: from.lng } }).catch(() => {});
  const rec = await pingPath(d, tripId, from, to);
  await put(`${API.trips}/trips/${tripId}/complete`, D);
  const done = await get(`${API.trips}/trips/${tripId}`, P).catch(() => null);
  if (s.stars) await post(`${API.trips}/trips/ratings/${tripId}`, { ...P, body: { stars: s.stars, comment: s.comment } }).catch(e => fail('Viaje', `${label} calificar`, e));
  tripsLog.push({ p: p.key, d: d.key, from: s.from, to: s.to, scenario: label, tripId, fare: done?.estimatedFare, final: 'completado', coupon: done?.couponCode ?? null });
  return { done, ida, rec };
}

async function runTrip(s) {
  const p = byKey[s.p], d = byKey[s.d], from = PLACES[s.from], to = PLACES[s.to];
  const label = `${s.p}->${s.d} ${s.from}->${s.to} [${s.scenario}]`;
  const P = { token: p.token }, D = { token: d.token }, A = { token: adminToken };
  let tripId;
  try {
    const fare = fareFor(from, to);
    const body = {
      originAddress: from.address, originLat: from.lat, originLng: from.lng,
      destAddress: to.address, destLat: to.lat, destLng: to.lng,
      estimatedFare: fare, paymentMethod: s.method ?? 'cash',
      waypoints: s.waypoint ? [{ address: PLACES[s.waypoint].address, lat: PLACES[s.waypoint].lat, lng: PLACES[s.waypoint].lng }] : [],
      serviceType: s.delivery ? 1 : 0,
      ...(s.delivery ? { packageDescription: s.delivery, packageWeightKg: 2.5, packageIsFragile: !!s.fragile, packageDetails: 'Entregar en recepcion',
        recipientName: s.recipient ?? 'Recepcion del destino', recipientPhone: '952999888' } : {}),
      ...(s.scheduledHour ? { scheduledAt: tomorrowPeru(s.scheduledHour) } : {}),
    };
    // Envio: datos + fotos del paquete en una sola peticion (sin fotos no se crea)
    const t = s.delivery
      ? await post(`${API.trips}/trips/delivery`, { ...P, form: form({ data: JSON.stringify(body) },
          { files: [[imgBlob(`paquete1_${s.img}.png`), 'paquete1.png'], [imgBlob(`paquete2_${s.img}.png`), 'paquete2.png']] }) })
      : await post(`${API.trips}/trips`, { ...P, body });
    tripId = t.id;
    if (t.suggestedFare == null) fail('Viaje', `${label} suggestedFare`, 'el TripDto no trae suggestedFare');

    if (s.cancel === 'pending') {
      await put(`${API.trips}/trips/${tripId}/cancel`, { ...P, body: { reason: 'Ya no necesito el viaje' } });
      ok('Viaje', label, 'cancelado por pasajero antes de asignar'); tripsLog.push({ ...s, tripId, fare, final: 'cancelado' }); return;
    }
    if (s.leavePending) {
      if (s.scheduledHour) ok('Programado', label, `queda PROGRAMADO SIN conductor para ${body.scheduledAt} (hora de Peru)`);
      else ok('Viaje', label, `queda pendiente buscando conductor (Bugie lo cancela a los 10 min si nadie lo toma; vence ${t.expiresAt ?? '?'})`);
      tripsLog.push({ ...s, tripId, fare, final: s.scheduledHour ? 'programado sin conductor' : 'pendiente' }); return;
    }

    // ---- asignacion
    let finalFare = fare;
    if (s.mode === 'propose') {
      const offer = Math.round((fare + 2) * 2) / 2;
      const other = byKey[s.other ?? (s.d === 'D1' ? 'D2' : 'D1')];
      const r1 = await put(`${API.trips}/trips/${tripId}/propose`, { ...D, body: { proposedFare: offer } });
      if (other && other.token && other.key !== s.d) await put(`${API.trips}/trips/${tripId}/propose`, { token: other.token, body: { proposedFare: offer + 1.5 } }).catch(e => fail('Viaje', `${label} contraoferta 2do conductor`, e));
      if (s.cancel === 'negotiating') {
        await put(`${API.trips}/trips/${tripId}/cancel`, { ...P, body: { reason: 'Encontré otra movilidad' } });
        // La negociacion se cierra: las ofertas pasan a 'cancelled'
        const props = await get(`${API.trips}/trips/${tripId}/proposals`, P).catch(() => []);
        const abiertas = (props ?? []).filter(x => ['pending', 'accepted_by_passenger', 'driver_accepted'].includes(x.status)).length;
        if (abiertas === 0) ok('Viaje', label, `cancelado negociando: ${props?.length ?? 0} ofertas cerradas`);
        else fail('Viaje', `${label} ofertas siguen abiertas`, `${abiertas} abiertas`);
        tripsLog.push({ ...s, tripId, fare, final: 'cancelado' }); return;
      }
      if (s.leaveNegotiating) {
        const [st] = viajeFila(tripId);
        if (st === '7') ok('Viaje', label, `queda NEGOCIANDO con 2 ofertas (S/ ${offer} y S/ ${offer + 1.5}); Bugie lo cancela a los 10 min si el pasajero no elige`);
        else fail('Viaje', `${label} estado`, `quedo en status ${st}, se esperaba 7 (negociando)`);
        tripsLog.push({ ...s, tripId, fare, final: 'negociando' }); return;
      }
      const acc = await put(`${API.trips}/trips/${tripId}/accept-proposal/${r1.proposalId}`, P);
      if (!acc?.confirmExpiresAt) fail('Viaje', `${label} confirmExpiresAt`, 'accept-proposal no devolvio el plazo del conductor');
      await put(`${API.trips}/trips/${tripId}/confirm-acceptance/${r1.proposalId}`, D);
      finalFare = offer;
    } else if (s.mode === 'counter') {
      const counter = Math.max(5, Math.round((fare - 1.5) * 2) / 2);
      // La contraoferta solo va a un conductor que ya oferto; el conductor la acepta a ese monto.
      await put(`${API.trips}/trips/${tripId}/propose`, { ...D, body: { proposedFare: Math.round((fare + 1) * 2) / 2 } });
      const c = await post(`${API.trips}/trips/${tripId}/counter`, { ...P, body: { driverId: d.userId, fare: counter } });
      const r = await post(`${API.trips}/trips/${tripId}/accept-counter/${c.proposalId}`, D);
      if (Number(r?.tripDto?.estimatedFare) !== counter) fail('Viaje', `${label} monto de la contraoferta`, `quedo S/ ${r?.tripDto?.estimatedFare}, se esperaba S/ ${counter}`);
      finalFare = counter;
    } else {
      // Aceptacion a tarifa: el conductor acepta y el pasajero lo elige.
      const r = await post(`${API.trips}/trips/${tripId}/driver-accept`, D);
      await put(`${API.trips}/trips/${tripId}/confirm-driver-acceptance/${r.proposalId}`, P);
    }

    // Programado aceptado para manana: queda asi (no cuenta como viaje activo).
    if (s.scheduledHour) {
      const act = await get(`${API.trips}/trips/active`, D).catch(() => null);
      if (act?.id === tripId) fail('Programado', `${label} cuenta como activo`, 'un programado futuro no deberia bloquear al conductor');
      const mine = await get(`${API.trips}/trips/scheduled`, D).catch(() => []);
      if (!(mine ?? []).some(x => x.id === tripId)) fail('Programado', `${label} no aparece en /trips/scheduled`, 'el conductor no lo ve');
      ok('Programado', label, `aceptado para ${body.scheduledAt} (hora de Peru)`);
      tripsLog.push({ ...s, tripId, fare, final: 'programado' }); return;
    }

    if (s.cancel === 'accepted') {
      await pingPath(d, tripId, d.pos ?? d.at, from, 0.4).catch(() => {});
      const c = await put(`${API.trips}/trips/${tripId}/cancel`, { ...D, body: { reason: 'El pasajero no se presenta' } });
      if (c?.cancelledBy === 'driver') ok('Viaje', label, `cancelado por el CONDUCTOR (motivo: ${c.cancelReason})`);
      else fail('Viaje', `${label} cancelledBy`, `quedo como "${c?.cancelledBy}"`);
      tripsLog.push({ ...s, tripId, fare, final: 'cancelado' }); return;
    }

    // conductor va al punto de recojo (ruta por calles) y avisa "Ya llegue" (push al pasajero)
    const ida = await pingPath(d, tripId, d.pos ?? d.at, from);
    if (!s.noArrive) {
      await put(`${API.trips}/trips/${tripId}/arrived`, D);
      const act = await get(`${API.trips}/trips/active`, P).catch(() => null);
      if (!act?.driverArrivedAt) fail('Llegada', `${label} driverArrivedAt`, 'el pasajero no ve la llegada');
    }
    // Envios: "recogimos tu paquete" (push + correo al remitente)
    if (s.delivery) {
      await post(`${API.trips}/trips/${tripId}/pickup-verification`,{ ...D, form: form({ observation: 'Paquete recibido sellado' }, { main: [[imgBlob(`recojo_${s.img}.png`), 'recojo.png']], secondary: [[imgBlob(`recojo2_${s.img}.png`), 'recojo2.png']] }) });
      correo(p, 'paquete recogido');
    }

    let coupon = null;
    if (s.coupon) {
      const code = p.coupons?.shift();
      if (code) {
        try { const c = await post(`${API.trips}/trips/${tripId}/coupon`, { ...P, body: { code } }); coupon = code; ok('Cupon', `${p.key} aplica ${code}`, `descuento S/ ${c.discountAmount ?? c.discount ?? '?'}`); }
        catch (e) { fail('Cupon', `${p.key} aplicar ${code}`, e); }
      } else fail('Cupon', `${p.key} no tiene cupon disponible`, 'sin canje previo');
    }

    await put(`${API.trips}/trips/${tripId}/start`, D);
    await put(`${API.trips}/trips/passenger-location`, { ...P, body: { lat: from.lat, lng: from.lng } }).catch(() => {});

    if (s.leaveInProgress) {
      const r = await pingPath(d, tripId, from, to, 0.5);
      ok('Viaje', label, `queda EN CURSO (seguimiento en mapa): ${r.puntos} puntos GPS, a mitad de la ruta`); tripsLog.push({ ...s, tripId, fare, final: 'en curso' }); return;
    }

    const rec = await pingPath(d, tripId, from, to);

    if (s.sos) {
      const mid = route(from, to, 2)[1];
      const r = await post(`${API.trips}/sos`, { ...P, body: { tripId, lat: mid.lat, lng: mid.lng } });
      ok('SOS', `${p.key} activa SOS en viaje`, `alerta ${r.alertId}`);
      await put(`${API.trips}/sos/${r.alertId}/resolve`, { ...A, body: { reason: 'Se llamo a la pasajera, falsa alarma: el conductor tomo un desvio por obras.' } });
      ok('SOS', 'admin resuelve SOS');
    }

    if (s.delivery) {
      // Sin confirmar la entrega no se puede completar un envio
      const sinConfirmar = await put(`${API.trips}/trips/${tripId}/complete`, D).then(() => true).catch(() => false);
      if (sinConfirmar) fail('Envio', `${label} se completo sin confirmar entrega`, 'deberia rechazarse');
      // Confirmacion en destino: foto + quien recibio
      const rec2 = s.recipient ?? 'Recepcion del destino';
      await post(`${API.trips}/trips/${tripId}/delivery-confirmation`, { ...D, form: form({ receivedBy: rec2 }, { photo: [[imgBlob(`entrega_${s.img}.png`), 'entrega.png']] }) });
      correo(p, 'envio entregado');
      ok('Envio', `${label} entrega confirmada`, `recibio: ${rec2} · correos "recogido" y "entregado" a ${p.currentEmail}`);
      // Las fotos solo las ven pasajero, conductor del viaje o admin
      const otro = drivers.find(x => x.status === 'approved' && x.key !== s.d);
      const visto = await get(`${API.trips}/trips/${tripId}/photos`, { token: otro.token }).then(() => true).catch(e => e.status !== 403);
      if (visto) fail('Envio', 'fotos visibles para otro conductor', 'deberia ser 403');
    }
    await put(`${API.trips}/trips/${tripId}/complete`, D);
    const done = await get(`${API.trips}/trips/${tripId}`, P).catch(() => null);
    ok('Viaje', label, `completado S/ ${done?.finalFare ?? finalFare} ${s.method ?? 'cash'}${coupon ? ` con cupon (antes S/ ${done?.fareBeforeDiscount ?? '?'})` : ''} · GPS ${ida.puntos}+${rec.puntos} puntos (${ida.km}+${rec.km} km${rec.real ? '' : ', linea recta'})`);

    if (s.stars) {
      await post(`${API.trips}/trips/ratings/${tripId}`, { ...P, body: { stars: s.stars, comment: s.comment } });
    }
    if (s.incident) {
      await post(`${API.trips}/trips/incidents/${tripId}`, { token: (s.incidentBy === 'driver' ? d : p).token, body: { description: s.incident } });
      ok('Incidente', `${s.incidentBy ?? 'pasajero'} reporta incidente`);
    }
    tripsLog.push({ ...s, tripId, fare, final: 'completado', coupon });
  } catch (e) {
    fail('Viaje', label, e);
    tripsLog.push({ ...s, tripId, final: 'ERROR' });
    // no dejar viajes colgados que bloqueen al pasajero/conductor
    if (tripId) await put(`${API.trips}/trips/${tripId}/cancel`, P).catch(() => {});
  }
}

// Una tanda de viajes: los remitentes de envios tienen el correo real durante la tanda.
async function runTanda(lista, titulo) {
  console.log(`\n== ${titulo}`);
  const remitentes = [...new Set(lista.filter(s => s.delivery && !s.leavePending && !s.scheduledHour).map(s => byKey[s.p]))];
  await faseConCorreo(remitentes, remitentes.length * 2, async () => { for (const s of lista) await runTrip(s); });
}

// Escenarios: 5-10 viajes por pasajero activo.
const R = 'accept';
const TRIPS_A = [
  // P1 Lucia - 9 viajes
  { p: 'P1', d: 'D1', from: 'plaza', to: 'unjbg', method: 'cash', mode: R, scenario: 'directo', stars: 5, comment: 'Muy amable y puntual' },
  { p: 'P1', d: 'D2', from: 'unjbg', to: 'pocollay', method: 'yape', mode: 'propose', scenario: 'negociado 2 ofertas', stars: 5 },
  { p: 'P1', d: 'D3', from: 'pocollay', to: 'mercado', method: 'plin', mode: 'counter', scenario: 'contraoferta pasajero', stars: 4, comment: 'Buen viaje, auto algo caluroso' },
  { p: 'P1', d: 'D1', from: 'mercado', to: 'plaza', mode: R, scenario: 'cancelado pendiente', cancel: 'pending' },
  { p: 'P1', d: 'D2', from: 'plaza', to: 'aeropuerto', method: 'yape', mode: 'driverAccept', scenario: 'conductor acepta tarifa', stars: 5, waypoint: 'bolognesi' },
  // P2 Carlos - 7
  { p: 'P2', d: 'D3', from: 'terminal', to: 'plaza', method: 'cash', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P2', d: 'D1', from: 'plaza', to: 'estadio', method: 'yape', mode: 'propose', scenario: 'cancelado negociando', cancel: 'negotiating' },
  { p: 'P2', d: 'D2', from: 'estadio', to: 'albarr', method: 'plin', mode: R, scenario: 'directo', stars: 3, comment: 'Manejo un poco brusco', incident: 'El conductor no respeto un semaforo en Av. Bolognesi' },
  { p: 'P2', d: 'D1', from: 'albarr', to: 'hospital', method: 'cash', mode: R, scenario: 'delivery', delivery: 'Medicinas para entregar en farmacia', recipient: 'Carmen Flores', fragile: true, stars: 5 },
  // P3 Maria - 8
  { p: 'P3', d: 'D2', from: 'hospital', to: 'ciudadN', method: 'cash', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P3', d: 'D3', from: 'ciudadN', to: 'paseo', method: 'yape', mode: R, scenario: 'aceptado y cancelado por conductor', cancel: 'accepted' },
  { p: 'P3', d: 'D1', from: 'paseo', to: 'unjbg', method: 'yape', mode: 'driverAccept', scenario: 'conductor acepta tarifa', stars: 5 },
  { p: 'P3', d: 'D3', from: 'unjbg', to: 'albarr', method: 'cash', mode: R, scenario: 'con SOS resuelto', sos: true, stars: 4 },
  // P4 Jorge - 7
  { p: 'P4', d: 'D1', from: 'aeropuerto', to: 'plaza', method: 'plin', mode: 'propose', scenario: 'negociado', stars: 5 },
  { p: 'P4', d: 'D2', from: 'plaza', to: 'terminal', method: 'cash', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P4', d: 'D3', from: 'terminal', to: 'pocollay', method: 'yape', mode: 'counter', scenario: 'contraoferta', stars: 5 },
  { p: 'P4', d: 'D1', from: 'pocollay', to: 'mercado', method: 'cash', mode: R, scenario: 'cancelado pendiente', cancel: 'pending' },
  // P5 Rosa - 7
  { p: 'P5', d: 'D3', from: 'bolognesi', to: 'hospital', method: 'yape', mode: R, scenario: 'directo', stars: 5, comment: 'Excelente' },
  { p: 'P5', d: 'D2', from: 'hospital', to: 'unjbg', method: 'cash', mode: R, scenario: 'delivery', delivery: 'Documentos en sobre manila', recipient: 'Oficina de Mesa de Partes', stars: 5 },
  { p: 'P5', d: 'D1', from: 'unjbg', to: 'estadio', method: 'plin', mode: 'propose', scenario: 'negociado', stars: 4, incident: 'El pasajero dejo olvidada una mochila', incidentBy: 'driver' },
];
const TRIPS_B = [
  // segunda tanda: tras canjear puntos -> viajes con cupon (el primero de P1 usa su cupon de NIVEL)
  { p: 'P1', d: 'D3', from: 'aeropuerto', to: 'paseo', method: 'cash', mode: R, scenario: 'con cupon de nivel', coupon: true, stars: 5 },
  { p: 'P1', d: 'D1', from: 'paseo', to: 'ciudadN', method: 'yape', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P1', d: 'D2', from: 'ciudadN', to: 'terminal', method: 'plin', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P1', d: 'D3', from: 'terminal', to: 'unjbg', method: 'cash', mode: 'driverAccept', scenario: 'conductor acepta tarifa', stars: 5 },
  { p: 'P2', d: 'D2', from: 'hospital', to: 'aeropuerto', method: 'yape', mode: R, scenario: 'con cupon', coupon: true, stars: 4 },
  { p: 'P2', d: 'D3', from: 'aeropuerto', to: 'plaza', method: 'cash', mode: 'propose', scenario: 'negociado', stars: 5 },
  { p: 'P2', d: 'D1', from: 'plaza', to: 'mercado', method: 'plin', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P3', d: 'D1', from: 'albarr', to: 'aeropuerto', method: 'cash', mode: R, scenario: 'con cupon', coupon: true, stars: 5 },
  { p: 'P3', d: 'D2', from: 'aeropuerto', to: 'bolognesi', method: 'yape', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P3', d: 'D3', from: 'bolognesi', to: 'pocollay', method: 'plin', mode: R, scenario: 'cancelado pendiente', cancel: 'pending' },
  { p: 'P3', d: 'D1', from: 'pocollay', to: 'plaza', method: 'cash', mode: R, scenario: 'directo', stars: 5 },
  { p: 'P4', d: 'D2', from: 'mercado', to: 'unjbg', method: 'yape', mode: R, scenario: 'con cupon', coupon: true, stars: 5 },
  { p: 'P4', d: 'D3', from: 'unjbg', to: 'estadio', method: 'cash', mode: R, scenario: 'delivery', delivery: 'Torta de cumpleanos', recipient: 'Sofia Apaza', fragile: true, stars: 5 },
  { p: 'P4', d: 'D1', from: 'estadio', to: 'plaza', method: 'plin', mode: R, scenario: 'directo', stars: 4 },
  { p: 'P5', d: 'D2', from: 'estadio', to: 'albarr', method: 'cash', mode: R, scenario: 'con cupon', coupon: true, stars: 5 },
  { p: 'P5', d: 'D3', from: 'albarr', to: 'terminal', method: 'yape', mode: R, scenario: 'aceptado y cancelado por conductor', cancel: 'accepted' },
  { p: 'P5', d: 'D1', from: 'terminal', to: 'plaza', method: 'cash', mode: R, scenario: 'directo', stars: 5 },
];
// Estados vivos para la demo. Van AL FINAL del seed: un pedido inmediato sin
// conductor (pendiente o negociando) lo cancela Bugie a los 10 minutos
// (trip_no_driver_cancel_min). El programado con conductor de manana lo deja
// el escenario (i) de negociacion (P1 -> D3, 10:00).
const TRIPS_FINAL = [
  { p: 'P5', d: 'D2', from: 'hospital', to: 'terminal', method: 'yape', mode: R, scenario: 'PROGRAMADO envio manana 15:00 SIN conductor', scheduledHour: 15, leavePending: true,
    delivery: 'Caja con repuestos de celular', recipient: 'Jorge Mamani', fragile: true },
  { p: 'P2', d: 'D1', from: 'plaza', to: 'aeropuerto', method: 'yape', mode: R, scenario: 'EN CURSO para mapa', leaveInProgress: true },
  { p: 'P3', d: 'D2', other: 'D3', from: 'unjbg', to: 'pocollay', method: 'cash', mode: 'propose', scenario: 'NEGOCIANDO con 2 ofertas', leaveNegotiating: true },
  { p: 'P4', d: 'D2', from: 'hospital', to: 'pocollay', method: 'cash', mode: R, scenario: 'PENDIENTE buscando conductor', leavePending: true },
];

// ------------------------------------------------------------------ negociacion (escenarios nuevos)
const NEG = 'Negociacion';
// Deja al pasajero libre si un escenario fallo a medias.
async function limpiarViaje(p, tripId) { if (tripId) await put(`${API.trips}/trips/${tripId}/cancel`, { token: p.token, body: { reason: 'Limpieza del seed' } }).catch(() => {}); }

async function faseNegociacion() {
  console.log('\n== Negociacion: escenarios nuevos');
  const [P1, P2, P3, P4, P5] = ['P1', 'P2', 'P3', 'P4', 'P5'].map(k => byKey[k]);
  const [D1, D2, D3] = ['D1', 'D2', 'D3'].map(k => byKey[k]);
  const T = u => ({ token: u.token });
  const trips = `${API.trips}/trips`;

  // a) El pasajero elige a uno de dos conductores que aceptaron su precio; el otro queda rechazado.
  let tripId;
  try {
    const t = await crearViaje(P1, PLACES.plaza, PLACES.mercado); tripId = t.id;
    const a1 = await post(`${trips}/${tripId}/driver-accept`, T(D1));
    const a2 = await post(`${trips}/${tripId}/driver-accept`, T(D2));
    if (a1.status !== 'driver_accepted' || a2.status !== 'driver_accepted') throw new Error(`estados ${a1.status} / ${a2.status}`);
    const r = await put(`${trips}/${tripId}/confirm-driver-acceptance/${a1.proposalId}`, T(P1));
    const otra = propEstado(a2.proposalId);
    if (r?.tripDto?.driverId === D1.userId && otra.startsWith('rejected')) ok(NEG, 'a) pasajero elige a D1 entre dos que aceptaron su precio', `D1 asignado · oferta de D2 ${otra}`);
    else fail(NEG, 'a) elegir entre dos aceptaciones', `driverId ${r?.tripDto?.driverId} · oferta D2 ${otra}`);
    await completarViaje(P1, D1, tripId, PLACES.plaza, PLACES.mercado, 'a) elegido entre dos', { from: 'plaza', to: 'mercado', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'a) elegir entre dos aceptaciones', e); await limpiarViaje(P1, tripId); }

  // b) El conductor acepta la contraoferta del pasajero: el viaje queda a ESE monto.
  try {
    const from = PLACES.hospital, to = PLACES.estadio, fare = fareFor(from, to);
    const t = await crearViaje(P2, from, to); tripId = t.id;
    await put(`${trips}/${tripId}/propose`, { ...T(D2), body: { proposedFare: fare + 2 } });
    const contra = fare - 1;
    const c = await post(`${trips}/${tripId}/counter`, { ...T(P2), body: { driverId: D2.userId, fare: contra } });
    const r = await post(`${trips}/${tripId}/accept-counter/${c.proposalId}`, T(D2));
    const [st, drv] = viajeFila(tripId);
    if (Number(r?.tripDto?.estimatedFare) === contra && st === '2' && drv === D2.userId) ok(NEG, 'b) conductor acepta la contraoferta del pasajero', `viaje a S/ ${contra} (ofrecio S/ ${fare + 2})`);
    else fail(NEG, 'b) accept-counter', `estimatedFare ${r?.tripDto?.estimatedFare}, status ${st}, driver ${drv}`);
    await completarViaje(P2, D2, tripId, from, to, 'b) contraoferta aceptada', { from: 'hospital', to: 'estadio', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'b) accept-counter', e); await limpiarViaje(P2, tripId); }

  // c) Montos invalidos: 400 con el rango.
  try {
    const from = PLACES.unjbg, to = PLACES.plaza, fare = fareFor(from, to);
    const bajo = await esperaError(crearViaje(P3, from, to, { estimatedFare: 4 }), 400);
    if (bajo.ok) ok(NEG, 'c) crear viaje bajo base_fare -> 400', bajo.error); else fail(NEG, 'c) crear viaje bajo base_fare', `respondio ${bajo.got}: ${bajo.error}`);
    const t = await crearViaje(P3, from, to); tripId = t.id;
    for (const [nombre, monto] of [['0', 0], ['negativo', -5], ['10x la tarifa', fare * 10]]) {
      const r = await esperaError(put(`${trips}/${tripId}/propose`, { ...T(D3), body: { proposedFare: monto } }), 400);
      if (r.ok) ok(NEG, `c) proponer ${nombre} -> 400`, r.error); else fail(NEG, `c) proponer ${nombre}`, `respondio ${r.got}: ${r.error}`);
    }
    await put(`${trips}/${tripId}/propose`, { ...T(D3), body: { proposedFare: fare + 1 } });
    const fuera = await esperaError(post(`${trips}/${tripId}/counter`, { ...T(P3), body: { driverId: D3.userId, fare: fare * 5 } }), 400);
    if (fuera.ok) ok(NEG, 'c) contraoferta fuera de rango -> 400', fuera.error); else fail(NEG, 'c) contraoferta fuera de rango', `respondio ${fuera.got}: ${fuera.error}`);
    const cero = await esperaError(post(`${trips}/${tripId}/counter`, { ...T(P3), body: { driverId: D3.userId, fare: 0 } }), 400);
    if (cero.ok) ok(NEG, 'c) contraoferta 0 -> 400', cero.error); else fail(NEG, 'c) contraoferta 0', `respondio ${cero.got}: ${cero.error}`);
    // Cierre normal: contraoferta valida y el conductor la acepta
    const c = await post(`${trips}/${tripId}/counter`, { ...T(P3), body: { driverId: D3.userId, fare } });
    await post(`${trips}/${tripId}/accept-counter/${c.proposalId}`, T(D3));
    await completarViaje(P3, D3, tripId, from, to, 'c) tras montos invalidos', { from: 'unjbg', to: 'plaza', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'c) montos invalidos', e); await limpiarViaje(P3, tripId); }

  // d) Dos confirmaciones "a la vez": exactamente una 200 y la otra 409; el viaje con un solo conductor.
  try {
    const from = PLACES.terminal, to = PLACES.mercado;
    const t = await crearViaje(P4, from, to); tripId = t.id;
    const a1 = await post(`${trips}/${tripId}/driver-accept`, T(D1));
    const a2 = await post(`${trips}/${tripId}/driver-accept`, T(D2));
    const rs = await Promise.allSettled([
      put(`${trips}/${tripId}/confirm-driver-acceptance/${a1.proposalId}`, T(P4)),
      put(`${trips}/${tripId}/confirm-driver-acceptance/${a2.proposalId}`, T(P4)),
    ]);
    const oks = rs.filter(r => r.status === 'fulfilled'), errs = rs.filter(r => r.status === 'rejected');
    const [st, drv] = viajeFila(tripId);
    const ganador = oks[0]?.value?.tripDto?.driverId;
    const asignadas = Number(sql(`SELECT count(*) FROM trips.tripproposals WHERE tripid = '${tripId}' AND status = 'accepted'`));
    if (oks.length === 1 && errs.length === 1 && errs[0].reason?.status === 409 && st === '2' && drv === ganador && asignadas === 1)
      ok(NEG, 'd) dos confirmaciones a la vez: una 200 y otra 409', `gano ${ganador === D1.userId ? 'D1' : 'D2'} · 409: ${errs[0].reason.body?.error}`);
    else fail(NEG, 'd) dos confirmaciones a la vez', `200=${oks.length} errores=${errs.map(e => e.reason?.status).join(',')} status=${st} driver=${drv} accepted=${asignadas}`);
    const d = drv === D1.userId ? D1 : D2;
    await completarViaje(P4, d, tripId, from, to, 'd) confirmacion simultanea', { from: 'terminal', to: 'mercado', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'd) dos confirmaciones a la vez', e); await limpiarViaje(P4, tripId); }

  // e) El pasajero acepta una oferta, se arrepiente (cancel-acceptance) y acepta otra.
  try {
    const from = PLACES.paseo, to = PLACES.albarr, fare = fareFor(from, to);
    const t = await crearViaje(P5, from, to); tripId = t.id;
    const o1 = await put(`${trips}/${tripId}/propose`, { ...T(D1), body: { proposedFare: fare + 2 } });
    const o2 = await put(`${trips}/${tripId}/propose`, { ...T(D2), body: { proposedFare: fare + 1 } });
    const acc = await put(`${trips}/${tripId}/accept-proposal/${o1.proposalId}`, T(P5));
    // Mientras tiene una aceptada no puede aceptar otra
    const dos = await esperaError(put(`${trips}/${tripId}/accept-proposal/${o2.proposalId}`, T(P5)), 409);
    if (!dos.ok) fail(NEG, 'e) segunda aceptacion deberia ser 409', `respondio ${dos.got}`);
    await put(`${trips}/${tripId}/cancel-acceptance/${o1.proposalId}`, T(P5));
    const e1 = propEstado(o1.proposalId);
    const deshechas = Number(sql(`SELECT count(*) FROM trips.passengeracceptancecancellations WHERE tripid = '${tripId}'`));
    await put(`${trips}/${tripId}/accept-proposal/${o2.proposalId}`, T(P5));
    const r = await put(`${trips}/${tripId}/confirm-acceptance/${o2.proposalId}`, T(D2));
    const e1b = propEstado(o1.proposalId);
    if (acc?.confirmExpiresAt && e1 === 'pending|' && deshechas === 1 && r?.tripDto?.driverId === D2.userId && e1b.startsWith('rejected'))
      ok(NEG, 'e) acepta a D1, deshace y acepta a D2', `D1 volvio a pending y luego quedo ${e1b} · 1 registro de aceptacion deshecha`);
    else fail(NEG, 'e) deshacer aceptacion', `confirmExpiresAt=${acc?.confirmExpiresAt} D1=${e1}->${e1b} deshechas=${deshechas} driver=${r?.tripDto?.driverId}`);
    await completarViaje(P5, D2, tripId, from, to, 'e) aceptacion deshecha', { from: 'paseo', to: 'albarr', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'e) deshacer aceptacion', e); await limpiarViaje(P5, tripId); }

  // f) El conductor retira su oferta despues de que el pasajero la acepto: aviso al pasajero, que elige otra.
  try {
    const from = PLACES.mercado, to = PLACES.ciudadN, fare = fareFor(from, to);
    const t = await crearViaje(P1, from, to); tripId = t.id;
    const o3 = await put(`${trips}/${tripId}/propose`, { ...T(D3), body: { proposedFare: fare + 1.5 } });
    const o1 = await put(`${trips}/${tripId}/propose`, { ...T(D1), body: { proposedFare: fare + 2.5 } });
    await put(`${trips}/${tripId}/accept-proposal/${o3.proposalId}`, T(P1));
    const dec = await put(`${trips}/${tripId}/decline-by-driver`, T(D3));
    await sleep(2500); // el aviso se guarda en segundo plano
    const e3 = propEstado(o3.proposalId);
    const aviso1 = avisos(P1.userId, 'offer_withdrawn', tripId);
    const [st] = viajeFila(tripId);
    await put(`${trips}/${tripId}/accept-proposal/${o1.proposalId}`, T(P1));
    const r = await put(`${trips}/${tripId}/confirm-acceptance/${o1.proposalId}`, T(D1));
    if (dec?.affected >= 1 && e3.startsWith('rejected') && aviso1 >= 1 && st !== '5' && r?.tripDto?.driverId === D1.userId)
      ok(NEG, 'f) conductor retira su oferta ya aceptada; el pasajero elige a otro', `oferta de D3 ${e3} · aviso offer_withdrawn en la bandeja de P1 · D1 asignado`);
    else fail(NEG, 'f) retirar oferta aceptada', `affected=${dec?.affected} D3=${e3} avisos=${aviso1} status=${st} driver=${r?.tripDto?.driverId}`);
    await completarViaje(P1, D1, tripId, from, to, 'f) oferta retirada', { from: 'mercado', to: 'ciudadN', stars: 4 });
    tripId = null;
  } catch (e) { fail(NEG, 'f) retirar oferta aceptada', e); await limpiarViaje(P1, tripId); }

  // k) Conductor ocupado (viaje en curso) intenta tomar otro: 409.
  let tripA, tripB;
  try {
    const fromA = PLACES.estadio, toA = PLACES.unjbg, fromB = PLACES.bolognesi, toB = PLACES.pocollay;
    tripA = (await crearViaje(P2, fromA, toA)).id;
    const a = await post(`${trips}/${tripA}/driver-accept`, T(D1));
    await put(`${trips}/${tripA}/confirm-driver-acceptance/${a.proposalId}`, T(P2));
    await pingPath(D1, tripA, D1.pos ?? D1.at, fromA);
    await put(`${trips}/${tripA}/arrived`, T(D1));
    await put(`${trips}/${tripA}/start`, T(D1));
    tripB = (await crearViaje(P3, fromB, toB)).id;
    const r1 = await esperaError(post(`${trips}/${tripB}/driver-accept`, T(D1)), 409);
    const r2 = await esperaError(put(`${trips}/${tripB}/propose`, { ...T(D1), body: { proposedFare: fareFor(fromB, toB) + 1 } }), 409);
    if (r1.ok && r2.ok) ok(NEG, 'k) conductor en viaje en curso no puede aceptar ni ofertar en otro (409)', `${r1.error} · ${r2.error}`);
    else fail(NEG, 'k) conductor ocupado', `driver-accept ${r1.got} · propose ${r2.got}`);
    const b = await post(`${trips}/${tripB}/driver-accept`, T(D2));
    await put(`${trips}/${tripB}/confirm-driver-acceptance/${b.proposalId}`, T(P3));
    // D1 termina su viaje; D2 hace el suyo
    await put(`${trips}/passenger-location`, { ...T(P2), body: { lat: fromA.lat, lng: fromA.lng } }).catch(() => {});
    await pingPath(D1, tripA, fromA, toA);
    await put(`${trips}/${tripA}/complete`, T(D1));
    await post(`${trips}/ratings/${tripA}`, { ...T(P2), body: { stars: 5 } }).catch(() => {});
    tripsLog.push({ p: 'P2', d: 'D1', from: 'estadio', to: 'unjbg', scenario: 'k) viaje en curso del conductor ocupado', tripId: tripA, final: 'completado' });
    tripA = null;
    await completarViaje(P3, D2, tripB, fromB, toB, 'k) tomado por otro conductor', { from: 'bolognesi', to: 'pocollay', stars: 5 });
    tripB = null;
  } catch (e) {
    fail(NEG, 'k) conductor ocupado', e);
    if (tripA) await put(`${trips}/${tripA}/complete`, T(D1)).catch(() => limpiarViaje(P2, tripA));
    await limpiarViaje(P3, tripB);
  }

  // l) reject-all con 2 ofertas; rechazar una aceptacion a tarifa (driver_accepted).
  try {
    const from = PLACES.ciudadN, to = PLACES.bolognesi, fare = fareFor(from, to);
    const t = await crearViaje(P4, from, to); tripId = t.id;
    const o1 = await put(`${trips}/${tripId}/propose`, { ...T(D1), body: { proposedFare: fare + 3 } });
    const o2 = await put(`${trips}/${tripId}/propose`, { ...T(D2), body: { proposedFare: fare + 2.5 } });
    const ra = await put(`${trips}/${tripId}/proposals/reject-all`, T(P4));
    const e1 = propEstado(o1.proposalId), e2 = propEstado(o2.proposalId);
    if (ra?.affected === 2 && e1 === 'rejected|passenger' && e2 === 'rejected|passenger') ok(NEG, 'l) reject-all con 2 ofertas', `2 ofertas rechazadas por el pasajero`);
    else fail(NEG, 'l) reject-all', `affected=${ra?.affected} D1=${e1} D2=${e2}`);
    const a3 = await post(`${trips}/${tripId}/driver-accept`, T(D3));
    await put(`${trips}/${tripId}/proposals/${a3.proposalId}/reject`, T(P4));
    const e3 = propEstado(a3.proposalId);
    const otraVez = await esperaError(put(`${trips}/${tripId}/proposals/${a3.proposalId}/reject`, T(P4)), 400);
    if (e3 === 'rejected|passenger' && otraVez.ok) ok(NEG, 'l) rechazar una aceptacion a tarifa (driver_accepted)', `queda ${e3}; rechazarla de nuevo da 400`);
    else fail(NEG, 'l) rechazar driver_accepted', `estado ${e3} · segundo rechazo ${otraVez.got}`);
    // D3 vuelve a aceptar y esta vez el pasajero lo elige
    const a3b = await post(`${trips}/${tripId}/driver-accept`, T(D3));
    await put(`${trips}/${tripId}/confirm-driver-acceptance/${a3b.proposalId}`, T(P4));
    await completarViaje(P4, D3, tripId, from, to, 'l) tras rechazar ofertas', { from: 'ciudadN', to: 'bolognesi', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'l) rechazar ofertas', e); await limpiarViaje(P4, tripId); }

  // i) Programado de manana aceptado; el conductor lo cancela antes de la hora -> se REABRE y otro lo toma.
  try {
    const from = PLACES.plaza, to = PLACES.aeropuerto, hora = tomorrowPeru(10);
    const t = await crearViaje(P1, from, to, { scheduledAt: hora }); tripId = t.id;
    const a1 = await post(`${trips}/${tripId}/driver-accept`, T(D1));
    await put(`${trips}/${tripId}/confirm-driver-acceptance/${a1.proposalId}`, T(P1));
    const c = await put(`${trips}/${tripId}/cancel`, { ...T(D1), body: { reason: 'Se me malogro el auto, no podre ir manana' } });
    await sleep(2500);
    const e1 = propEstado(a1.proposalId);
    const reabierto = avisos(P1.userId, 'trip_reopened', tripId);
    const [st, drv, , , sch] = viajeFila(tripId);
    if (c?.status === 1 && c?.driverId == null && c?.scheduledAt && st === '1' && drv === '' && sch)
      ok(NEG, 'i) programado cancelado por el conductor antes de la hora -> reabierto', `status 1, sin conductor, sigue programado ${hora} · oferta de D1 ${e1} · aviso trip_reopened a P1: ${reabierto} (push; el backend no envia correo por esto)`);
    else fail(NEG, 'i) reabrir programado', `respuesta status=${c?.status} driverId=${c?.driverId} scheduledAt=${c?.scheduledAt} · BD ${st}/${drv}/${sch}`);
    const a3 = await post(`${trips}/${tripId}/driver-accept`, T(D3));
    await put(`${trips}/${tripId}/confirm-driver-acceptance/${a3.proposalId}`, T(P1));
    const mine = await get(`${trips}/scheduled`, T(D3)).catch(() => []);
    if ((mine ?? []).some(x => x.id === tripId)) ok(NEG, 'i) otro conductor (D3) toma el programado reabierto', `queda para la demo: programado manana 10:00 CON conductor`);
    else fail(NEG, 'i) D3 toma el programado', 'no aparece en /trips/scheduled de D3');
    tripsLog.push({ p: 'P1', d: 'D3', from: 'plaza', to: 'aeropuerto', scenario: 'i) PROGRAMADO manana 10:00 reabierto y tomado por D3', tripId, final: 'programado' });
    tripId = null;
  } catch (e) { fail(NEG, 'i) reabrir programado', e); await limpiarViaje(P1, tripId); }

  // j) Programado cuyo conductor no llega: el pasajero republica y otro conductor lo toma.
  try {
    const from = PLACES.unjbg, to = PLACES.paseo;
    const t = await crearViaje(P5, from, to, { scheduledAt: tomorrowPeru(9) }); tripId = t.id;
    const a2 = await post(`${trips}/${tripId}/driver-accept`, T(D2));
    await put(`${trips}/${tripId}/confirm-driver-acceptance/${a2.proposalId}`, T(P5));
    // La hora programada "ya paso" hace 20 minutos (ajuste en BD; el conductor nunca avisa llegada)
    sql(`UPDATE trips.trips SET scheduledat = (now() AT TIME ZONE 'utc') - interval '20 minutes' WHERE id = '${tripId}'`);
    const tarde = await get(`${trips}/${tripId}/tracking`, T(P5)).catch(() => null);
    const r = await put(`${trips}/${tripId}/republish`, T(P5));
    const e2 = propEstado(a2.proposalId);
    if (r?.status === 1 && r?.driverId == null && tarde?.driverLate === true)
      ok(NEG, 'j) programado con conductor que no llego: el pasajero republica', `driverLate=true · viaje vuelve a pendiente · oferta de D2 ${e2}`);
    else fail(NEG, 'j) republicar', `driverLate=${tarde?.driverLate} status=${r?.status} driverId=${r?.driverId}`);
    const a3 = await post(`${trips}/${tripId}/driver-accept`, T(D3));
    await put(`${trips}/${tripId}/confirm-driver-acceptance/${a3.proposalId}`, T(P5));
    await completarViaje(P5, D3, tripId, from, to, 'j) republicado y tomado por D3', { from: 'unjbg', to: 'paseo', stars: 5 });
    tripId = null;
  } catch (e) { fail(NEG, 'j) republicar', e); await limpiarViaje(P5, tripId); }
}

// g) y h): vencimientos. Corren EN PARALELO con las fases de admin (no crean viajes).
// Bajan los plazos a 1 minuto via settings, esperan al servicio de vencimientos de
// Trips (cada 5 s; su cache de settings dura 30 s) y restauran 2 / 10 al final.
async function faseVencimientos() {
  const P2 = byKey.P2, P5 = byKey.P5, D3 = byKey.D3, A = { token: adminToken };
  const trips = `${API.trips}/trips`;
  const setSetting = (k, v) => put(`${API.landing}/landing/settings/${k}`, { ...A, body: { value: String(v) } });
  let tripG, tripH;
  try {
    await setSetting('driver_confirm_immediate_min', 1);
    await setSetting('trip_no_driver_cancel_min', 1);
    ok('Vencimientos', 'settings bajados a 1 minuto', 'driver_confirm_immediate_min=1, trip_no_driver_cancel_min=1');

    // h) viaje que nadie toma
    tripH = (await crearViaje(P5, PLACES.hospital, PLACES.plaza)).id;
    // g) oferta aceptada que el conductor no confirma
    const fromG = PLACES.pocollay, toG = PLACES.hospital;
    tripG = (await crearViaje(P2, fromG, toG)).id;
    const o = await put(`${trips}/${tripG}/propose`, { token: D3.token, body: { proposedFare: fareFor(fromG, toG) + 1.5 } });
    const acc = await put(`${trips}/${tripG}/accept-proposal/${o.proposalId}`, { token: P2.token });
    ok('Vencimientos', 'g) P2 acepta la oferta de D3 y D3 NO confirma', `vence ${acc?.confirmExpiresAt} (segun el setting de ese momento)`);
    ok('Vencimientos', 'h) P5 crea un viaje que nadie toma', `vence ${(await get(`${trips}/active`, { token: P5.token }).catch(() => null))?.expiresAt ?? '?'}`);

    const t0 = Date.now();
    const gListo = await esperar(() => propEstado(o.proposalId) === 'rejected|driver_no_confirm', 160000, 5000);
    const eg = propEstado(o.proposalId);
    if (gListo) {
      await sleep(2000);
      const avisoP2 = avisos(P2.userId, 'driver_no_confirm', tripG);
      ok('Vencimientos', 'g) la oferta vence por falta de confirmacion', `${eg} a los ${Math.round((Date.now() - t0) / 1000)} s · aviso driver_no_confirm a P2: ${avisoP2}`);
      // Un conductor que no confirmo ya no puede confirmar
      const tarde = await esperaError(put(`${trips}/${tripG}/confirm-acceptance/${o.proposalId}`, { token: D3.token }), 409);
      if (tarde.ok) ok('Vencimientos', 'g) confirmar despues del plazo -> 409', tarde.error); else fail('Vencimientos', 'g) confirmar tarde', `respondio ${tarde.got}`);
    } else fail('Vencimientos', 'g) vencimiento de confirmacion', `tras 160 s la oferta sigue ${eg}`);

    const hListo = await esperar(() => viajeFila(tripH)[0] === '5', 160000, 5000);
    const [st, , by, reason] = viajeFila(tripH);
    if (hListo && by === 'system') {
      await sleep(2000);
      const avisoP5 = Number(sql(`SELECT count(*) FROM trips.usernotifications WHERE userid = '${P5.userId}' AND data->>'trip_id' = '${tripH}' AND data->>'reason_code' = 'no_driver_timeout'`));
      ok('Vencimientos', 'h) viaje sin ofertas cancelado por el sistema', `cancelledBy=${by} · "${reason}" · aviso no_driver_timeout a P5: ${avisoP5}`);
      tripH = null;
    } else fail('Vencimientos', 'h) cancelacion por falta de conductor', `status=${st} cancelledBy=${by}`);
    tripsLog.push({ p: 'P5', from: 'hospital', to: 'plaza', scenario: 'h) nadie lo tomo (cancelado por el sistema)', tripId: tripH, final: 'cancelado' });
  } catch (e) { fail('Vencimientos', 'g/h', e); }
  finally {
    // g) el pasajero cierra su pedido (ya nadie lo confirmo)
    if (tripG) await put(`${trips}/${tripG}/cancel`, { token: P2.token, body: { reason: 'El conductor no confirmo, pido otro' } }).catch(() => {});
    tripsLog.push({ p: 'P2', d: 'D3', from: 'pocollay', to: 'hospital', scenario: 'g) oferta vencida sin confirmar', tripId: tripG, final: 'cancelado' });
    if (tripH) await put(`${trips}/${tripH}/cancel`, { token: P5.token }).catch(() => {});
    try {
      await setSetting('driver_confirm_immediate_min', 2);
      await setSetting('trip_no_driver_cancel_min', 10);
      ok('Vencimientos', 'settings restaurados', 'driver_confirm_immediate_min=2, trip_no_driver_cancel_min=10');
    } catch (e) { fail('Vencimientos', 'restaurar settings', e); }
    await sleep(35000); // la cache de settings de Trips dura 30 s: que nada se cree con el plazo de 1 min
  }
}

// ------------------------------------------------------------------ canjes y puntos
let cuponNivelP1 = null, cuponTicketP1 = null;
async function faseCanjes(raffles) {
  console.log('\n== Canjes de puntos');
  await sleep(8000);   // outbox de Trips -> Rewards cada 5 s
  let catalog = [];
  for (const u of [...passengers, ...drivers].filter(x => x.status === 'approved')) {
    try {
      if (!catalog.length) catalog = await get(`${API.rewards}/rewards/catalog`, { token: u.token });
      const me = await get(`${API.rewards}/rewards/me`, { token: u.token });
      const pts = me.availablePoints ?? me.available ?? 0;
      ok('Puntos', `${u.key} tiene ${pts} pts disponibles`, `nivel ${me.currentLevel ?? me.level ?? '?'} · total ${me.totalPoints ?? '?'}`);
      const myCat = await get(`${API.rewards}/rewards/catalog`, { token: u.token });
      const wanted = u.role === 'passenger' ? ['pass_discount_2', 'pass_discount_2'] : ['drv_bonus_5'];
      let left = pts;
      for (const code of wanted) {
        const item = myCat.find(i => i.code === code);
        // Sin saldo suficiente no es un error: el sistema debe rechazarlo. Solo canjea quien alcanza.
        if (!item || left < item.pointsCost) { ok('Canje', `${u.key} ${code} omitido`, `puntos insuficientes (${left} < ${item?.pointsCost ?? '?'}), no canjea`); continue; }
        const r = await post(`${API.rewards}/rewards/redeem`, { token: u.token, body: { catalogItemId: item.id } });
        const c = r.redemption?.code ?? r.code;
        (u.coupons ??= []).push(c); (u.redeemed ??= []).push(c);
        left = r.availablePointsAfter ?? left - item.pointsCost;
        ok('Canje', `${u.key} canjea ${item.name}`, `cupon ${c}, le quedan ${left} pts`);
      }
    } catch (e) { fail('Canje', u.key, e); }
  }

  // ---- Puntos nuevos: nivel Plata, cupon de nivel, ticket de sorteo
  const p1 = byKey.P1, A = { token: adminToken }, P = { token: p1.token };
  try {
    let me = await get(`${API.rewards}/rewards/me`, P);
    const item = (await get(`${API.rewards}/rewards/catalog`, P)).find(i => i.code === 'pass_raffle_1');
    const costo = item?.pointsCost ?? 5000;
    // Para ser Plata hacen falta 5000 pts totales y para el ticket 5000 disponibles:
    // el admin le acredita lo que falte con un ajuste (queda en el historial de puntos).
    const falta = Math.max(5000 - (me.totalPoints ?? 0), costo - (me.availablePoints ?? 0), 0);
    if (falta > 0) {
      await post(`${API.rewards}/rewards/admin/users/${p1.userId}/adjust`, { ...A, body: { points: falta + 100, reason: 'Bono de campaña de lanzamiento (datos de prueba): sube a nivel Plata' } });
      me = await get(`${API.rewards}/rewards/me`, P);
      ok('Puntos', `ajuste +${falta + 100} pts a P1 para llegar a Plata`, `ahora ${me.availablePoints} disponibles, total ${me.totalPoints}, nivel ${me.currentLevel}`);
    }
    if (!['silver', 'gold', 'platinum'].includes(me.currentLevel)) fail('Puntos', 'P1 deberia ser nivel Plata o superior', `nivel ${me.currentLevel} con ${me.totalPoints} pts totales`);
    // Beneficio de nivel: cupon de descuento del mes (no cuesta puntos)
    const ben = await get(`${API.rewards}/rewards/me/level-benefits`, P);
    if (!ben?.eligible || (ben.discountCoupons?.available ?? 0) < 1) fail('Puntos', 'P1 beneficios de nivel', `eligible=${ben?.eligible} cupones disponibles=${ben?.discountCoupons?.available} ${ben?.notEligibleReason ?? ''}`);
    const claim = await post(`${API.rewards}/rewards/me/level-benefits/claim`, { ...P, body: { type: 'discount' } });
    cuponNivelP1 = claim?.coupon?.code;
    if (cuponNivelP1) {
      (p1.coupons ??= []).unshift(cuponNivelP1);   // lo usa en su primer viaje "con cupon" de la tanda 2
      ok('Puntos', `P1 (${ben.levelName}) reclama su cupon de nivel`, `${cuponNivelP1}: ${ben.discountPercentage}% de descuento · quedan ${claim.benefits?.discountCoupons?.available} este mes · se usa en el siguiente viaje`);
    } else fail('Puntos', 'reclamar cupon de nivel', JSON.stringify(claim).slice(0, 200));
    // Ticket de sorteo del catalogo y uso en el sorteo especial (abierto)
    if (item) {
      const r = await post(`${API.rewards}/rewards/redeem`, { ...P, body: { catalogItemId: item.id } });
      cuponTicketP1 = r.redemption;
      (p1.redeemed ??= []).push(cuponTicketP1.code);
      ok('Canje', `P1 canjea "${item.name}"`, `cupon ${cuponTicketP1.code}, le quedan ${r.availablePointsAfter} pts`);
      const abiertos = await get(`${API.rewards}/rewards/raffles`, P);
      const especial = (abiertos ?? []).find(x => x.raffleType === 'special' && x.status === 'open') ?? (abiertos ?? []).find(x => x.status === 'open' && x.eligible);
      if (!especial) throw new Error('no hay un sorteo abierto para usar el ticket');
      const u = await post(`${API.rewards}/rewards/raffles/${especial.id}/use-ticket-coupon`, { ...P, body: { redemptionId: cuponTicketP1.id } });
      if (u?.ticketsAdded >= 1) ok('Sorteo', `P1 usa su cupon de ticket en "${u.raffleName}"`, `+${u.ticketsAdded} ticket(s) ${u.ticketNumbers?.join(', ')} · ahora tiene ${u.myTickets}`);
      else fail('Sorteo', 'usar cupon de ticket', JSON.stringify(u).slice(0, 200));
      const otraVez = await esperaError(post(`${API.rewards}/rewards/raffles/${especial.id}/use-ticket-coupon`, { ...P, body: { redemptionId: cuponTicketP1.id } }), 400);
      if (otraVez.ok) ok('Sorteo', 'usar el mismo cupon de ticket otra vez -> 400', otraVez.error); else fail('Sorteo', 'cupon de ticket reutilizado', `respondio ${otraVez.got}`);
    } else fail('Canje', 'pass_raffle_1 no esta en el catalogo');
  } catch (e) { fail('Puntos', 'nivel Plata / cupon de nivel / ticket de sorteo de P1', e); }
}

async function faseAdminFinal(raffles) {
  console.log('\n== Admin: revisiones, sorteos, ajustes, contacto');
  const A = { token: adminToken };
  // Todos los activos con correo real durante la fase: pagos a conductores (bonos, manual,
  // premio), ganadores de los 3 sorteos (correo + push), invitacion de referido y contacto.
  await faseConCorreo(aprobados(), 11, async () => {
  // canjes de conductores: el admin registra el PAGO (metodo, n. operacion) y cierra el canje
  let op = 88210;
  for (const d of drivers.filter(x => x.redeemed?.length)) {
    const code = d.redeemed[0];
    const method = op % 2 ? 'yape' : 'plin';
    try {
      const pago = await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
        driverId: d.userId, driverName: d.name, amount: 5, method, operationNumber: String(++op),
        sourceType: 'reward_redemption', sourceRef: code, note: 'Bono S/ 5 por puntos' } });
      await put(`${API.rewards}/rewards/admin/redemptions/${code}/use`, { ...A, body: { note: `Pagado por ${method} · op ${pago.operationNumber} · S/ 5.00` } });
      correo(d, 'pago de bono');
      ok('Pago', `bono ${code} de ${d.key} pagado por ${method}`, `op ${pago.operationNumber} · correo a ${d.currentEmail}`);
      // no se puede pagar dos veces el mismo canje
      await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
        driverId: d.userId, amount: 5, method, operationNumber: '1', sourceType: 'reward_redemption', sourceRef: code } })
        .then(() => fail('Pago', `duplicado ${code}`, 'se acepto un segundo pago'))
        .catch(e => e.status === 409 ? null : fail('Pago', `duplicado ${code}`, e));
    }
    catch (e) { fail('Pago', `bono de ${d.key}`, e); }
  }
  // pago manual en efectivo (bono especial)
  try {
    await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
      driverId: byKey.D2.userId, driverName: byKey.D2.name, amount: 20, method: 'efectivo',
      sourceType: 'manual', note: 'Bono por mejor calificacion del mes' } });
    correo(byKey.D2, 'pago manual');
    ok('Pago', 'pago manual en efectivo a D2', `S/ 20 · correo a ${byKey.D2.currentEmail}`);
  } catch (e) { fail('Pago', 'pago manual', e); }
  // un cupon sin usar se anula (devuelve puntos)
  const p5 = byKey.P5;
  if (p5.coupons?.length) {
    try { await put(`${API.rewards}/rewards/admin/redemptions/${p5.coupons[0]}/cancel`, { ...A, body: { note: 'Anulado a pedido de la usuaria, se devuelven los puntos' } }); ok('Admin', `anula canje ${p5.coupons[0]} de P5 (devuelve puntos)`); }
    catch (e) { fail('Admin', 'anular canje P5', e); }
  }
  // ajustes manuales
  for (const [k, pts, reason] of [['P3', 200, 'Compensacion por demora en viaje con SOS'], ['D2', 150, 'Bono por buena atencion reportada'], ['P2', -50, 'Correccion de puntos duplicados']]) {
    try { await post(`${API.rewards}/rewards/admin/users/${byKey[k].userId}/adjust`, { ...A, body: { points: pts, reason } }); ok('Admin', `ajuste ${pts > 0 ? '+' : ''}${pts} pts a ${k}`); }
    catch (e) { fail('Admin', `ajuste a ${k}`, e); }
  }
  // sorteos: repartir tickets, sortear ("Sortear ahora") y entregar premios
  try { const r = await post(`${API.rewards}/rewards/admin/raffles/maintenance?draw=false`, A); ok('Sorteo', 'repartir tickets (mantenimiento)', JSON.stringify(r).slice(0, 150)); }
  catch (e) { fail('Sorteo', 'repartir tickets', e); }
  const todos = [...passengers, ...drivers];
  const ganadorDe = w => todos.find(x => x.userId === w.userId);
  try {
    const list = await get(`${API.rewards}/rewards/admin/raffles`, A);
    for (const r of list) ok('Sorteo', `"${r.name}"`, `${r.ticketsNow} tickets`);
    const monthly = list.find(r => r.raffleType === 'monthly');
    if (monthly) {
      await post(`${API.rewards}/rewards/admin/raffles/${monthly.id}/draw`, A);
      const after = (await get(`${API.rewards}/rewards/admin/raffles`, A)).find(r => r.id === monthly.id);
      const w = after.winners?.[0];
      const g = w && ganadorDe(w);
      if (g) correo(g, 'ganador sorteo mensual');
      ok('Sorteo', `se sortea "${monthly.name}"`, w ? `ganador ${w.userName ?? g?.key} ticket ${w.ticketNumber} · correo + push a ${g?.currentEmail ?? '?'}` : 'sin ganador');
      if (w) { await put(`${API.rewards}/rewards/admin/raffles/winners/${w.id}/deliver`, { ...A, body: { note: 'Premio entregado como saldo de viajes' } }); ok('Sorteo', 'premio entregado', `a ${w.userName ?? w.userId}`); }
    }
    // sorteo de conductores: el premio se paga en dinero y queda en el reporte
    const weekly = list.find(r => r.raffleType === 'weekly');
    if (weekly) {
      await post(`${API.rewards}/rewards/admin/raffles/${weekly.id}/draw`, A);
      const after = (await get(`${API.rewards}/rewards/admin/raffles`, A)).find(r => r.id === weekly.id);
      const w = after.winners?.[0];
      if (w) {
        const ganador = ganadorDe(w);
        correo(ganador, 'ganador sorteo semanal');
        await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
          driverId: w.userId, driverName: w.userName, amount: weekly.prizeValue ?? 120, method: 'transferencia',
          operationNumber: '00045871', sourceType: 'raffle_prize', sourceRef: w.id, note: 'Premio sorteo semanal' } });
        correo(ganador, 'pago del premio');
        await put(`${API.rewards}/rewards/admin/raffles/winners/${w.id}/deliver`, { ...A, body: { note: 'Pagado por transferencia · op 00045871' } });
        ok('Sorteo', `sorteo semanal: ganó ${w.userName}`, `premio pagado por transferencia · correos a ${ganador?.currentEmail}`);
      }
    }
    // sorteo especial (donde P1 uso su cupon de ticket): "Sortear ahora" desde el admin
    const special = list.find(r => r.raffleType === 'special');
    if (special) {
      await post(`${API.rewards}/rewards/admin/raffles/${special.id}/draw`, A);
      const after = (await get(`${API.rewards}/rewards/admin/raffles`, A)).find(r => r.id === special.id);
      const ws = after.winners ?? [];
      for (const w of ws) correo(ganadorDe(w), 'ganador sorteo especial');
      const p1Tickets = Number(sql(`SELECT count(*) FROM rewards.raffletickets WHERE raffleid = '${special.id}' AND userid = '${byKey.P1.userId}'`));
      ok('Sorteo', `"Sortear ahora" en "${special.name}"`, `${ws.length} ganador(es): ${ws.map(w => `${w.userName ?? ganadorDe(w)?.key} (${w.ticketNumber})`).join(', ')} · P1 participo con ${p1Tickets} ticket(s) · correo + push a los ganadores`);
      for (const w of ws) await put(`${API.rewards}/rewards/admin/raffles/winners/${w.id}/deliver`, { ...A, body: { note: 'Premio entregado en oficina' } }).catch(e => fail('Sorteo', 'entregar premio especial', e));
    }
  } catch (e) { fail('Sorteo', 'sortear / entregar', e); }
  // bono sin cancelaciones (usa endpoint interno de Trips)
  try { const today = new Date().toISOString().slice(0, 10); const r = await post(`${API.rewards}/rewards/admin/no-cancellations/run?date=${today}`, A); ok('Rewards', 'bono sin cancelaciones', JSON.stringify(r).slice(0, 150)); }
  catch (e) { fail('Rewards', 'bono sin cancelaciones', e); }
  // referidos: invitacion por correo (va directo al correo real)
  try { await post(`${API.rewards}/rewards/me/referral/invite`, { token: byKey.P1.token, body: { email: REAL_EMAIL } }); correoDirecto('invitacion de referido'); ok('Referido', 'P1 invita por correo', `correo de invitacion a ${REAL_EMAIL}`); }
  catch (e) { fail('Referido', 'invitacion por correo', e); }
  // contacto web + respuesta del admin
  try {
    const c = await post(`${API.landing}/landing/contact`, { body: { name: 'Usuario de prueba Bugie', email: REAL_EMAIL, subject: 'Consulta', message: 'Hola, quisiera saber si Bugie opera en Pocollay los fines de semana.' } });
    ok('Contacto', 'mensaje desde la web', 'correo de aviso al admin');
    await put(`${API.landing}/landing/contact/${c.id}/read`, A).catch(e => fail('Contacto', 'marcar leido', e));
    await post(`${API.landing}/landing/contact/${c.id}/reply`, { ...A, body: { subject: 'Re: Consulta', body: 'Hola, si: Bugie opera en Pocollay todos los dias, incluidos fines de semana. Gracias por escribirnos.' } });
    correoDirecto('respuesta de contacto');
    ok('Contacto', 'admin responde', `correo de respuesta a ${REAL_EMAIL}`);
    await post(`${API.landing}/landing/contact`, { body: { name: 'Empresa Logistica Sur', email: 'contacto@logisticasur.test', subject: 'Alianza', message: 'Nos interesa una alianza para envios corporativos en Tacna.' } });
    ok('Contacto', 'segundo mensaje sin leer (para bandeja del admin)');
  } catch (e) { fail('Contacto', 'contacto / respuesta', e); }
  }); // fin faseConCorreo

  // reportes del admin
  for (const [name, url] of [
    ['viajes stats', `${API.trips}/trips/admin/stats`], ['ranking conductores', `${API.trips}/trips/admin/reports/driver-ranking?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`],
    ['pagos stats', `${API.payments}/payments/stats`], ['usuarios stats', `${API.auth}/auth/users/stats`],
    ['conductores stats', `${API.drivers}/drivers/stats`], ['uso de cupones', `${API.rewards}/rewards/admin/coupon-usage`],
    ['balance de puntos', `${API.rewards}/rewards/admin/balance`], ['SOS', `${API.trips}/sos`],
    ['pagos a conductores', `${API.payments}/payments/admin/payouts`],
  ]) {
    try { const r = await get(url, A); ok('Reporte', name, JSON.stringify(r).slice(0, 160)); }
    catch (e) { fail('Reporte', name, e); }
  }
  // cada conductor ve los pagos que Bugie le hizo (web y app)
  for (const d of drivers.filter(x => x.status === 'approved')) {
    try {
      const r = await get(`${API.payments}/payments/payouts/me`, { token: d.token });
      ok('Pagos recibidos', `${d.key} ve ${r.total} pago(s)`, `S/ ${r.totalAmount}`);
      const v = await get(`${API.drivers}/drivers/vehicles/me`, { token: d.token });
      if (v?.isActive !== true) fail('Vehiculo', `${d.key} isActive`, JSON.stringify(v).slice(0, 120));
      const fotos = await get(`${API.drivers}/drivers/vehicles/${v.id}/photos`, { token: d.token });
      if ((fotos ?? []).length !== 3 || !v.photoUrl) fail('Vehiculo', `${d.key} 3 fotos`, JSON.stringify(fotos).slice(0, 160));
    } catch (e) { fail('Pagos recibidos', d.key, e); }
  }
  // hora de cancelacion guardada
  const canc = tripsLog.find(t => t.final === 'cancelado' && t.tripId);
  if (canc) {
    try {
      const page = await get(`${API.trips}/trips/admin/paged?page=1&pageSize=100`, A);
      const t = (page.items ?? page).find(x => x.id === canc.tripId);
      if (t?.cancelledAt) ok('Cancelacion', 'hora de cancelacion guardada', `${t.cancelledBy} · ${t.cancelledAt}`);
      else fail('Cancelacion', 'cancelledAt', 'no llego en el viaje');
    } catch (e) { fail('Cancelacion', 'cancelledAt', e); }
  }
  // nombres en el admin (viajes y pagos)
  try {
    const tp = await get(`${API.trips}/trips/admin/paged?page=1&pageSize=20`, A);
    const conNombre = (tp.items ?? []).filter(x => x.passengerName).length;
    ok('Admin', 'viajes con nombre de pasajero', `${conNombre}/${(tp.items ?? []).length}`);
    const pp = await get(`${API.payments}/payments/paged?page=1&pageSize=5`, A);
    const pg = (pp.items ?? [])[0];
    if (pg?.passengerName && pg?.driverName) ok('Admin', 'pagos con nombres', `${pg.passengerName} -> ${pg.driverName}`);
    else fail('Admin', 'pagos con nombres', JSON.stringify(pg).slice(0, 120));
  } catch (e) { fail('Admin', 'nombres', e); }
  // el pasajero ve por que se cancelo su viaje (lo cancelo el conductor)
  const cd = tripsLog.find(t => t.final === 'cancelado' && t.cancel === 'accepted');
  if (cd) {
    try {
      const t = await get(`${API.trips}/trips/${cd.tripId}`, { token: byKey[cd.p].token });
      if (t.cancelledBy === 'driver' && t.cancelReason) ok('Cancelacion', `${cd.p} ve que el conductor cancelo`, t.cancelReason);
      else fail('Cancelacion', 'detalle para el pasajero', JSON.stringify(t).slice(0, 120));
    } catch (e) { fail('Cancelacion', 'GET /trips/{id}', e); }
  }
  // recorrido real de un viaje completado (para el mapa del admin)
  const done = tripsLog.find(t => t.final === 'completado');
  if (done) {
    try { const r = await get(`${API.drivers}/drivers/admin/trips/${done.tripId}/path`, A); ok('Recorrido', `viaje ${done.p}->${done.d}`, `${r.points} puntos GPS, ${r.distanceKm} km`); }
    catch (e) { fail('Recorrido', 'path del viaje', e); }
  }
  // el cupon de nivel de P1 se uso en un viaje
  if (cuponNivelP1) {
    const t = tripsLog.find(x => x.coupon === cuponNivelP1);
    if (t) ok('Puntos', `cupon de nivel ${cuponNivelP1} usado en el viaje ${t.p}->${t.d} ${t.from}->${t.to}`);
    else fail('Puntos', `cupon de nivel ${cuponNivelP1} no se uso en ningun viaje`);
    const estado = sql(`SELECT status FROM rewards.redemptions WHERE code = '${cuponNivelP1}'`);
    if (estado !== 'used') fail('Puntos', `cupon de nivel ${cuponNivelP1} deberia quedar used`, `quedo ${estado}`);
  }
}

// ------------------------------------------------------------------ estados del conductor
async function faseEstadosConductor() {
  console.log('\n== Estados del conductor: suspension, revision, rechazo');
  const A = { token: adminToken };
  await faseConCorreo([byKey.D2, byKey.D5], 4, async () => {
  // Miguel (D2): suspendido con fecha -> pide revision -> se mantiene -> pide de nuevo -> reactivado
  const m = byKey.D2;
  if (m.driverId && m.token) {
    try {
      await put(`${API.drivers}/drivers/go-offline`, { token: m.token }).catch(() => {});
      await post(`${API.drivers}/drivers/me/presence/checkout`, { token: m.token }).catch(() => {});
      const until = addDays(peruToday(), 3);
      const s = await post(`${API.drivers}/drivers/admin/${m.driverId}/suspend`, { ...A, body: {
        reason: 'Queja de un pasajero por trato descortés; se investiga el caso.', until } });
      correo(m, 'suspension');
      ok('Estado conductor', `D2 suspendido hasta ${until}`, `estado ${s?.status} · correo a ${m.currentEmail}`);
      await post(`${API.drivers}/drivers/me/review-request`, { token: m.token, body: { message: 'Fue un malentendido con el pasajero. Tengo el audio del viaje como prueba.' } });
      ok('Estado conductor', 'D2 solicita revision');
      await post(`${API.drivers}/drivers/admin/${m.driverId}/review-request/keep`, { ...A, body: { reason: 'Se mantiene la suspensión hasta revisar el audio del viaje.' } });
      correo(m, 'revision: se mantiene');
      ok('Estado conductor', 'admin mantiene la suspension de D2');
      await post(`${API.drivers}/drivers/me/review-request`, { token: m.token, body: { message: 'Envié el audio al correo de soporte, por favor revisen mi caso.' } });
      ok('Estado conductor', 'D2 solicita revision de nuevo');
      const r = await post(`${API.drivers}/drivers/admin/${m.driverId}/reactivate`, { ...A, body: { reason: 'Se revisó el audio: no hubo falta. Se levanta la suspensión.' } });
      correo(m, 'reactivacion');
      if (r?.status === 3) ok('Estado conductor', 'admin reactiva a D2', 'queda aprobado');
      else fail('Estado conductor', 'reactivar D2', `quedo en estado ${r?.status}`);
      await connectDriver(m, '0.95');
      ok('Conexion', 'D2 vuelve a conectarse (selfie + en linea)');
      const tl = await get(`${API.drivers}/drivers/admin/${m.driverId}/timeline`, A);
      ok('Estado conductor', 'linea de tiempo de D2', (tl ?? []).map(x => x.action).reverse().join(' > '));
    } catch (e) { fail('Estado conductor', 'flujo de suspension de D2', e); }
  }
  // Hugo (D5): el admin rechaza su registro y el pide revision (queda ABIERTA)
  const h = byKey.D5;
  if (h?.driverId && h.token) {
    try {
      const r = await post(`${API.drivers}/drivers/admin/${h.driverId}/reject`, { ...A, body: {
        reason: 'La licencia de conducir no tiene la categoría requerida (A-IIa) para taxi.' } });
      correo(h, 'registro rechazado');
      ok('Estado conductor', 'admin rechaza el registro de D5', `estado ${r?.status} · correo "registro no aceptado" a ${h.currentEmail}`);
      // Puede seguir subiendo documentos estando rechazado
      await post(`${API.drivers}/drivers/documents`, { token: h.token, form: form({ docType: 'license', expiresAt: inOneYear() }, { file: [[imgBlob(`license_${h.key}.png`), 'license.png']] }) })
        .then(() => ok('Estado conductor', 'D5 sube su licencia recategorizada'))
        .catch(e => fail('Estado conductor', 'D5 sube licencia', e));
      await post(`${API.drivers}/drivers/me/review-request`, { token: h.token, body: {
        message: 'Ya tramité la recategorización de mi licencia a A-IIa y subí la nueva licencia. Pido que revisen mi registro.' } });
      const me = await get(`${API.drivers}/drivers/me`, { token: h.token });
      if (me?.openReviewRequest) ok('Estado conductor', 'D5 envia solicitud de revision', 'queda ABIERTA para el admin');
      else fail('Estado conductor', 'D5 solicitud abierta', JSON.stringify(me).slice(0, 160));
    } catch (e) { fail('Estado conductor', 'rechazo de D5', e); }
  }
  });
}

// ------------------------------------------------------------------ feriado + libro de reclamaciones
async function faseLibro() {
  console.log('\n== Feriado extra y Libro de Reclamaciones');
  const A = { token: adminToken };
  // Feriado extra en un dia habil cercano (la fecha limite de las hojas lo salta)
  try {
    let date = addDays(peruToday(), 6);
    const taken = new Set();
    for (const y of new Set([date.slice(0, 4), addDays(date, 14).slice(0, 4)]))
      for (const x of await get(`${API.landing}/landing/admin/holidays/year/${y}`, A)) taken.add(x.date);
    while (isWeekend(date) || taken.has(date)) date = addDays(date, 1);
    await post(`${API.landing}/landing/admin/holidays`, { ...A, body: { name: 'Feriado de prueba (decreto)', kind: 'extra', date } })
      .then(() => ok('Feriado', `feriado extra "Feriado de prueba (decreto)"`, date))
      .catch(e => e.status === 409 ? ok('Feriado', 'feriado extra ya existia', date) : fail('Feriado', 'feriado extra', e));
  } catch (e) { fail('Feriado', 'feriado extra', e); }

  // Busca la hoja en el admin (los posibles bots no salen en la lista por defecto)
  async function hoja(code) {
    for (const st of ['', '&status=posible_bot', '&status=descartada']) {
      const r = await get(`${API.landing}/landing/admin/complaints?page=1&pageSize=50&search=${encodeURIComponent(code)}${st}`, A);
      const it = (r?.items ?? []).find(x => x.code === code);
      if (it) return it;
    }
    throw new Error(`hoja ${code} no aparece en el admin`);
  }
  const base = x => ({ consumerAddress: 'Av. Bolognesi 850, Tacna', docType: 'DNI', goodType: 'servicio',
    goodDescription: 'Servicio de taxi Bugie', ...x, emailConfirm: x.email });
  const registrar = (body, token) => post(`${API.landing}/landing/complaints`, { token, body: base(body) });

  // 1) Reclamo PENDIENTE de Carlos, enlazado a su viaje por codigo corto
  const p2 = byKey.P2;
  const viaje = tripsLog.find(t => t.p === 'P2' && t.final === 'completado' && t.tripId);
  try {
    const c = await registrar({ consumerName: p2.name, docNumber: dniOf(p2.phone), phone: p2.phone, email: p2.email,
      complaintType: 'reclamo', claimedAmount: 6.5, tripCode: viaje?.tripId.slice(0, 8), reference: 'Cobro mayor a la tarifa acordada',
      detail: 'Acordé la tarifa con el conductor, pero al terminar el viaje la app me cobró más de lo pactado.',
      request: 'Que me devuelvan la diferencia cobrada.' }, p2.token);
    const it = await hoja(c.code);
    ok('Libro', `reclamo pendiente ${c.code}`, `enlazado al viaje ${it.tripId ? 'OK' : 'NO'} · vence ${c.dueDate}`);
    if (viaje && it.tripId !== viaje.tripId) fail('Libro', 'reclamo enlazado al viaje', `tripId ${it.tripId}`);
  } catch (e) { fail('Libro', 'reclamo pendiente con viaje', e); }

  // 2) Queja PENDIENTE de una persona sin cuenta
  try {
    const c = await registrar({ consumerName: 'Patricia Vargas Lazo', docNumber: '45879632', phone: '952456789', email: 'patricia.vargas@bugie.test',
      complaintType: 'queja', goodDescription: 'Atención del centro de soporte', reference: 'Objeto olvidado en un viaje',
      detail: 'Llamé dos veces a soporte por un objeto olvidado en el auto y nadie me devolvió la llamada.',
      request: 'Que mejoren la atención telefónica y me ayuden a recuperar mi objeto.' });
    ok('Libro', `queja pendiente ${c.code}`, `vence ${c.dueDate}`);
  } catch (e) { fail('Libro', 'queja pendiente', e); }

  // 3) Queja RESPONDIDA (correo real: confirmacion + respuesta), si queda presupuesto de correos
  try {
    const mail = puedeCorreoDirecto() ? REAL_EMAIL : 'usuario.prueba@bugie.test';
    const c = await registrar({ consumerName: 'Usuario de prueba Bugie', docNumber: '45123456', phone: '952123456', email: mail,
      complaintType: 'queja', reference: 'Demora en el recojo',
      detail: 'El conductor llegó 15 minutos tarde al punto de recojo y no avisó por la app.',
      request: 'Que los conductores avisen cuando se van a demorar.' });
    const it = await hoja(c.code);
    await post(`${API.landing}/landing/admin/complaints/${it.id}/reply`, { ...A, body: { response:
      'Hola, lamentamos la demora. Hablamos con el conductor y reforzamos el aviso de llegada en la app. Te abonamos S/ 5.00 para tu próximo viaje.' } });
    if (mail === REAL_EMAIL) { correoDirecto('libro: confirmacion'); correoDirecto('libro: respuesta'); }
    ok('Libro', `queja respondida ${c.code}`, `correos de confirmacion y respuesta a ${mail}`);
  } catch (e) { fail('Libro', 'queja respondida', e); }

  // 4) Hoja ANULADA con motivo
  try {
    const c = await registrar({ consumerName: 'Martin Quispe Huaman', docNumber: '45667788', phone: '952778899', email: 'martin.quispe@bugie.test',
      complaintType: 'queja', reference: 'Conductor no llegó',
      detail: 'Solicité un taxi y el conductor nunca llegó al punto de recojo.', request: 'Que revisen lo ocurrido.' });
    const it = await hoja(c.code);
    await post(`${API.landing}/landing/admin/complaints/${it.id}/void`, { ...A, body: { reason: 'Hoja duplicada: el mismo caso se registró dos veces y se atiende en la otra hoja.' } });
    ok('Libro', `hoja anulada ${c.code}`, 'con motivo');
  } catch (e) { fail('Libro', 'hoja anulada', e); }

  // 5) Posible bot (campo trampa lleno) DESCARTADO con motivo
  try {
    const c = await registrar({ consumerName: 'Promo Ganadora', docNumber: '41111111', phone: '999111222', email: 'promo.ganadora@bugie.test',
      complaintType: 'queja', reference: 'Oferta', detail: 'Gana dinero desde casa, visita nuestro sitio y registrate hoy.',
      request: 'Visita nuestro sitio.', website: 'http://spam.example' });
    const it = await hoja(c.code);
    await post(`${API.landing}/landing/admin/complaints/${it.id}/discard`, { ...A, body: { reason: 'Envío automático detectado por el campo trampa (publicidad).' } });
    ok('Libro', `posible bot descartado ${c.code}`, 'con motivo');
  } catch (e) { fail('Libro', 'bot descartado', e); }

  // 6) Posible bot SIN RESOLVER
  try {
    const c = await registrar({ consumerName: 'Juan Perez', docNumber: '42222222', phone: '999333444', email: 'jperez.seo@bugie.test',
      complaintType: 'reclamo', claimedAmount: 1, reference: 'SEO', detail: 'Ofrecemos posicionamiento SEO para su web a precio especial.',
      request: 'Contáctenos.', website: 'https://seo-rapido.example' });
    const it = await hoja(c.code);
    ok('Libro', `posible bot sin resolver ${c.code}`, it.isBot ? 'marcado como posible bot' : 'NO quedo como bot');
  } catch (e) { fail('Libro', 'bot sin resolver', e); }
}

// ------------------------------------------------------------------ cuenta
async function faseCuentas() {
  console.log('\n== Cuenta: contrasena, desactivacion y cuenta eliminada');
  // Maria (P3) cambia su contrasena (correo de constancia) y luego vuelve a 10203040
  const p3 = byKey.P3, OTRA = 'Tacna2026Bugie';
  await faseConCorreo([p3], 2, async () => {
    try {
      await post(`${API.auth}/auth/me/change-password`, { token: p3.token, body: { currentPassword: PASSWORD, newPassword: OTRA } });
      correo(p3, 'cambio de contrasena');
      try {
        const t2 = (await post(`${API.auth}/auth/login`, { body: { email: p3.currentEmail, password: OTRA } })).token;
        ok('Cuenta', 'P3 cambia su contrasena', `inicia sesion con la nueva · correo de constancia a ${p3.currentEmail}`);
        await post(`${API.auth}/auth/me/change-password`, { token: t2, body: { currentPassword: OTRA, newPassword: PASSWORD } });
        correo(p3, 'cambio de contrasena (vuelve)');
      } finally {
        // si algo fallo, igual se intenta dejar 10203040
        await post(`${API.auth}/auth/login`, { body: { email: p3.currentEmail, password: PASSWORD } }).catch(async () => {
          const t = (await post(`${API.auth}/auth/login`, { body: { email: p3.currentEmail, password: OTRA } })).token;
          await post(`${API.auth}/auth/me/change-password`, { token: t, body: { currentPassword: OTRA, newPassword: PASSWORD } });
        });
      }
      p3.token = await loginUser(p3);
      ok('Cuenta', 'P3 vuelve a la contrasena 10203040');
    } catch (e) { fail('Cuenta', 'cambio de contrasena de P3', e); }
  });
  // Jorge (P4): el admin desactiva su cuenta (no puede entrar) y la reactiva.
  // El backend no envia correo por desactivar/reactivar (solo auditoria), asi que no gasta correos.
  const p4 = byKey.P4, A = { token: adminToken };
  try {
    await put(`${API.auth}/auth/users/${p4.userId}/deactivate`, { ...A, body: { reason: 'Verificacion de identidad pendiente por denuncia de un tercero.' } });
    const bloqueado = await login(p4.email).then(() => false).catch(e => e.status === 401);
    const sinToken = await get(`${API.trips}/trips/active`, { token: p4.token }).then(() => false).catch(e => e.status === 401);
    const u = await get(`${API.auth}/auth/admin/users/${p4.userId}`, A);
    if (bloqueado && sinToken && u?.deactivatedAt) ok('Cuenta', 'admin desactiva la cuenta de P4', `login 401, token anterior 401 · motivo: ${u.deactivatedReason ?? '-'} (sin correo: el backend no envia uno)`);
    else fail('Cuenta', 'desactivar P4', `login bloqueado=${bloqueado} token invalido=${sinToken} deactivatedAt=${u?.deactivatedAt}`);
    const r = await put(`${API.auth}/auth/users/${p4.userId}/reactivate`, { ...A, body: { reason: 'Identidad verificada en oficina.' } });
    p4.token = await login(p4.email);
    const audit = await get(`${API.auth}/auth/admin/users/${p4.userId}/audit`, A).catch(() => []);
    const acciones = (Array.isArray(audit) ? audit : audit?.items ?? []).map(x => x.action);
    if (r && p4.token && acciones.includes('deactivated') && acciones.includes('reactivated')) ok('Cuenta', 'admin reactiva la cuenta de P4', `vuelve a iniciar sesion · auditoria: ${acciones.join(' > ')}`);
    else fail('Cuenta', 'reactivar P4', `token=${!!p4.token} auditoria=${acciones.join(',')}`);
  } catch (e) {
    fail('Cuenta', 'desactivar / reactivar P4', e);
    await put(`${API.auth}/auth/users/${p4.userId}/reactivate`, A).catch(() => {});
    p4.token = await login(p4.email).catch(() => p4.token);
  }
  // Sofia (P8) elimino su cuenta: no puede iniciar sesion y el admin la ve eliminada (no se restaura)
  const p8 = byKey.P8;
  try {
    const bloqueada = await login(p8.email).then(() => false).catch(e => e.status === 401);
    const u = await get(`${API.auth}/auth/admin/users/${p8.userId}`, { token: adminToken });
    if (bloqueada && u?.deletedAt) ok('Cuenta', 'P8 sigue eliminada', `desde ${u.deletedAt} · motivo: ${u.deletedReason ?? '-'}`);
    else fail('Cuenta', 'P8 eliminada', `login bloqueado=${bloqueada} deletedAt=${u?.deletedAt}`);
  } catch (e) { fail('Cuenta', 'verificar P8', e); }
}

// ------------------------------------------------------------------ bandeja de notificaciones
// Los push de los flujos ya quedan guardados en la bandeja. Aqui se marcan como
// leidos los mas antiguos (~la mitad) de algunos usuarios, para ver leidos y no leidos.
async function faseBandeja() {
  console.log('\n== Bandeja de notificaciones');
  await sleep(4000); // los ultimos avisos se guardan en segundo plano
  for (const k of ['P1', 'P2', 'P3', 'D1', 'D3']) {
    const u = byKey[k];
    try {
      const r = await get(`${API.trips}/trips/notifications/me?page=1&pageSize=100`, { token: u.token });
      const items = r?.items ?? [];
      const viejos = items.slice(Math.ceil(items.length / 2)); // vienen del mas reciente al mas antiguo
      for (const n of viejos) await post(`${API.trips}/trips/notifications/${n.id}/read`, { token: u.token });
      const c = await get(`${API.trips}/trips/notifications/me/unread-count`, { token: u.token });
      ok('Bandeja', `${k} tiene ${r?.total ?? items.length} avisos`, `${viejos.length} marcados leidos, ${c?.unread ?? '?'} sin leer`);
    } catch (e) { fail('Bandeja', k, e); }
  }
}

// ------------------------------------------------------------------ verificacion de imagenes
// Cada usuario con foto de perfil, cada conductor con sus documentos, fotos del
// vehiculo (frente, costado, placa) y selfies de conexion, cada envio con sus fotos
// (paquete, recojo, entrega) y cada URL respondiendo 200 (las sensibles salen ya
// firmadas en las respuestas del admin).
async function faseVerificacionImagenes() {
  console.log('\n== Verificacion de imagenes');
  const A = { token: adminToken };
  let urls = 0, malas = 0;
  const base = API.auth.replace('/api', '');
  async function url200(url, que) {
    if (!url) { fail('Imagenes', que, 'sin URL'); malas++; return false; }
    const u = url.startsWith('http') ? url : base + url;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      urls++;
      if (r.status === 200) return true;
      fail('Imagenes', que, `HTTP ${r.status} ${u}`); malas++; return false;
    } catch (e) { fail('Imagenes', que, `${u} no responde: ${e.message}`); malas++; return false; }
  }
  // fotos de perfil (todos los usuarios, incluida la cuenta eliminada)
  for (const u of [...passengers, ...drivers]) {
    if (!u.userId) continue;
    const url = sql(`SELECT coalesce(profilephotourl, '') FROM auth.users WHERE id = '${u.userId}'`);
    await url200(url, `${u.key} foto de perfil`);
  }
  // documentos de pasajero (DNI frente y reverso, URLs firmadas del detalle admin)
  for (const p of passengers) {
    if (!p.userId) continue;
    try {
      const d = await get(`${API.auth}/auth/admin/passengers/${p.userId}`, A);
      for (const tipo of ['dni_front', 'dni_back']) {
        const doc = (d.documents ?? []).find(x => x.docType === tipo);
        await url200(doc?.fileUrl, `${p.key} documento ${tipo}`);
      }
    } catch (e) { fail('Imagenes', `${p.key} detalle de pasajero`, e); }
  }
  // conductores: documentos, perfil, vehiculo con 3 fotos, selfies de conexion
  for (const d of drivers) {
    if (!d.driverId) continue;
    try {
      const det = await get(`${API.drivers}/drivers/${d.driverId}/detail`, A);
      for (const tipo of DRIVER_DOCS) {
        const doc = (det.documents ?? []).filter(x => x.docType === tipo).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
        await url200(doc?.fileUrl, `${d.key} documento ${tipo}`);
      }
      await url200(det.driver?.profilePhotoUrl, `${d.key} foto de perfil de conductor`);
      const v = (det.vehicles ?? [])[0];
      if (!v) { fail('Imagenes', `${d.key} sin vehiculo`); malas++; }
      else {
        const fotos = await get(`${API.drivers}/drivers/vehicles/${v.id}/photos`, A);
        for (const tipo of ['front', 'side', 'plate']) {
          const f = (fotos ?? []).find(x => (x.photoType ?? x.type) === tipo);
          await url200(f?.url, `${d.key} foto del vehiculo ${tipo}`);
        }
      }
      if (d.status === 'approved') {
        const pres = await get(`${API.drivers}/drivers/admin/${d.driverId}/presence?page=1&pageSize=100`, A);
        const items = pres?.items ?? [];
        const esperadas = d.key === 'D2' ? 6 : 5;
        if (items.length < esperadas) { fail('Imagenes', `${d.key} selfies de conexion`, `${items.length} conexiones, se esperaban ${esperadas}`); malas++; }
        for (const it of items) await url200(it.photoUrl, `${d.key} selfie de conexion ${it.checkedInAt}`);
      }
    } catch (e) { fail('Imagenes', `${d.key} detalle de conductor`, e); }
  }
  // envios: fotos del paquete (2), recojo (principal + adicional) y entrega
  for (const t of tripsLog.filter(x => x.delivery && x.tripId)) {
    try {
      const fotos = await get(`${API.trips}/trips/${t.tripId}/photos`, A);
      const porTipo = k => (fotos ?? []).filter(f => f.kind === k);
      const esperado = t.final === 'completado' ? { 0: 2, 1: 1, 2: 1, 3: 1 } : { 0: 2 };
      for (const [k, n] of Object.entries(esperado)) {
        const lista = porTipo(Number(k));
        if (lista.length < n) { fail('Imagenes', `envio ${t.p}->${t.d} fotos tipo ${k}`, `${lista.length} de ${n}`); malas++; }
        for (const f of lista) await url200(f.url, `envio ${t.p}->${t.d} foto tipo ${k}`);
      }
    } catch (e) { fail('Imagenes', `envio ${t.p}->${t.d} fotos`, e); }
  }
  if (malas === 0) ok('Imagenes', `${urls} URLs de imagenes verificadas (todas responden 200)`);
  else fail('Imagenes', `${malas} imagen(es) faltan o no responden`, `${urls} URLs probadas`);
}

// ================================================================== main
const t0 = Date.now();
let vencimientos = null;
try {
  generarImagenes();
  await faseAdmin();
  const raffles = await faseRewardsConfig();
  await fasePasajeros();
  await faseConductores();
  await runTanda(TRIPS_A, 'Viajes (tanda 1)');
  await faseCanjes(raffles);
  await runTanda(TRIPS_B, 'Viajes (tanda 2, con cupones)');
  await faseNegociacion();
  // g) y h) corren en paralelo con las fases de admin (ninguna crea viajes)
  vencimientos = faseVencimientos().catch(e => fail('Vencimientos', 'error no controlado', e));
  await sleep(8000);
  await faseAdminFinal(raffles);
  await faseEstadosConductor();
  await faseLibro();
  await faseCuentas();
  await vencimientos;
  await runTanda(TRIPS_FINAL, 'Estados finales para la demo (los pendientes inmediatos duran 10 min)');
  await faseBandeja();
  await faseVerificacionImagenes();
} catch (e) { fail('General', 'error no controlado', e); }
finally {
  // Pase lo que pase, nadie se queda con el alias del correo real
  devolverCorreos([...passengers, ...drivers]);
}

const out = join(HERE, 'logs'); mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'seed-resultado.json'), JSON.stringify({ report, trips: tripsLog, correos,
  users: [...passengers, ...drivers].map(({ token, docs, pos, currentEmail, ...u }) => u) }, null, 2));
const bad = report.filter(r => !r.ok);
console.log(`\nCorreos reales enviados (estimado): ${correos.estimados} de un maximo de ${MAX_CORREOS}`);
for (const d of correos.detalle) console.log(`   - ${d}`);
console.log(`\nListo en ${Math.round((Date.now() - t0) / 1000)} s — ${report.length - bad.length} OK, ${bad.length} con error.`);
