// =====================================================================
// Bugie - generador de datos de prueba para bugie_test
//
// Recorre los flujos REALES por HTTP (registro -> activacion -> viajes ->
// pagos -> puntos -> canjes -> cupones -> sorteos -> admin).
//
// Requisitos:
//   1) bugie_test limpia (01_limpiar_bugie_test.sql)
//   2) APIs levantadas contra bugie_test (levantar_apis_test.sh)
//
// Uso:  node scripts/test-data/seed.mjs
//
// Correos: cada vez que el backend envia un correo a un usuario, ese
// usuario tiene en ese momento el correo REAL_EMAIL. Despues se le cambia
// por su correo final (@bugie.test) para liberar REAL_EMAIL.
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
const PASSWORD   = '10203040';
const REAL_EMAIL = 'ghaluix@gmail.com';
const ADMIN      = { email: 'admin@bugie.pe', password: PASSWORD };
const PSQL       = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const DB_ARGS    = ['-h', 'localhost', '-U', 'postgres', '-d', 'bugie_test', '-tAq', '-v', 'ON_ERROR_STOP=1'];
const DB_ENV     = { ...process.env, PGPASSWORD: '147896321' };

// ------------------------------------------------------------------ log
const report = [];   // { area, step, ok, detail }
function ok(area, step, detail = '')   { report.push({ area, step, ok: true,  detail }); console.log(`  ✔ [${area}] ${step}${detail ? ' — ' + detail : ''}`); }
function fail(area, step, err)         { const d = String(err?.message ?? err).slice(0, 400); report.push({ area, step, ok: false, detail: d }); console.log(`  ✘ [${area}] ${step} — ${d}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ sql
function sql(q) {
  return execFileSync(PSQL, [...DB_ARGS, '-c', q], { env: DB_ENV, encoding: 'utf8' }).trim();
}

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
// base_fare 5.00 + fare_per_km 1.50 (landing.systemsettings), redondeado a 0.50
const fareFor = (a, b) => Math.round((5 + 1.5 * km(a, b) * 1.3) * 2) / 2;
function route(a, b, n = 10) {
  // Linea con una leve curva para que en el mapa no sea una recta perfecta
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, bend = Math.sin(t * Math.PI) * 0.0025;
    return { lat: a.lat + (b.lat - a.lat) * t + bend, lng: a.lng + (b.lng - a.lng) * t - bend };
  });
}

// ------------------------------------------------------------------ users
async function login(email) {
  const r = await post(`${API.auth}/auth/login`, { body: { email, password: PASSWORD } });
  return r.token;
}
function freeRealEmail() {
  sql(`UPDATE auth.users SET email = 'liberado.' || left(id::text, 8) || '@bugie.test' WHERE lower(email) = lower('${REAL_EMAIL}')`);
}
function setEmail(userId, email) {
  freeRealEmail();
  sql(`UPDATE auth.users SET email = '${email}' WHERE id = '${userId}'`);
}

// Documento de identidad de prueba: DNI = '4' + ultimos 7 digitos del celular
// (es el que sale dibujado en las imagenes del DNI). Unico por usuario.
const dniOf = (phone) => '4' + phone.slice(-7);

async function registerUser(u, role, referralCode) {
  // El registro siempre se hace con el correo real -> llega el correo de bienvenida
  // Documento y nombres separados son obligatorios (FullName lo arma la API).
  freeRealEmail();
  const r = await post(`${API.auth}/auth/register`, { body: {
    email: REAL_EMAIL, password: PASSWORD, phone: u.phone, role,
    docType: 'DNI', docNumber: dniOf(u.phone),
    firstNames: u.fn, lastNamePaternal: u.regAp ?? u.ap, lastNameMaternal: u.am ?? null,
    acceptedTerms: true, signatureImage: SIGNATURE, referralCode,
  } });
  u.userId = r.userId; u.token = r.token; u.role = role;
  ok('Registro', `${role} ${u.name}`, `correo de bienvenida a ${REAL_EMAIL}${referralCode ? `, referido con ${referralCode}` : ''}`);
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
}

async function faseRewardsConfig() {
  console.log('\n== Configuracion de rewards');
  const T = { token: adminToken };
  try { await put(`${API.rewards}/rewards/admin/settings/coupons_apply_to_fare`, { ...T, body: { value: 'true' } }); ok('Rewards', 'activar cupones en tarifa'); }
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
        ok('Pasajero', `${p.key} activado por admin`, `correo "cuenta activa" a ${REAL_EMAIL}`);
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
        ok('Pasajero', `${p.key} rechazado por admin`, `correo "vuelve a subir documentos" a ${REAL_EMAIL}`);
      } else if (p.status === 'deleted') {
        // Elimina su cuenta desde la app (con el correo real -> llega "tu cuenta fue eliminada")
        await post(`${API.auth}/auth/me/delete-account`, { token: p.token, body: { password: PASSWORD, reason: 'Ya no uso la aplicacion' } });
        ok('Pasajero', `${p.key} elimina su cuenta`, `correo "cuenta eliminada" a ${REAL_EMAIL}`);
        setEmail(p.userId, p.email);
        continue; // una cuenta eliminada ya no puede iniciar sesion
      } else ok('Pasajero', `${p.key} queda pendiente de revision`);
      setEmail(p.userId, p.email);
      p.token = await login(p.email);
      if (p.status === 'approved') {
        try { const r = await get(`${API.rewards}/rewards/me/referral`, { token: p.token }); p.referralCode = r.code; }
        catch (e) { fail('Rewards', `codigo de referido ${p.key}`, e); }
      }
    } catch (e) { fail('Pasajero', `${p.key} ${p.name}`, e); }
  }
}

// Conexion del conductor: selfie (check-in) y luego "en linea" en su punto de partida.
async function connectDriver(d, score) {
  await post(`${API.drivers}/drivers/me/presence/checkin`, { token: d.token, form: form({ faceQualityScore: score }, { file: [[imgBlob(`selfie_${d.key}.png`), 'selfie.png']] }) });
  await put(`${API.drivers}/drivers/go-online`, { token: d.token, body: d.at });
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
        ok('Conductor', `${d.key} documentos aprobados y conductor activado`, `correo "cuenta activa" a ${REAL_EMAIL}`);
      } else if (d.status === 'pending') {
        await put(`${API.drivers}/drivers/documents/${d.docs.soat}/reject`, { ...T, body: { reason: 'SOAT vencido en la foto, sube el vigente' } });
        ok('Conductor', `${d.key} queda en revision con SOAT rechazado`);
      } else ok('Conductor', `${d.key} queda en revision (el admin lo rechaza al final)`);
      setEmail(d.userId, d.email);
      d.token = await login(d.email);

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
async function pingRoute(d, tripId, a, b, n = 10) {
  for (const pt of route(a, b, n)) {
    await put(`${API.drivers}/drivers/location`, { token: d.token, body: { driverId: d.driverId, lat: pt.lat, lng: pt.lng, tripId, speedKmh: 28 + Math.round(Math.random() * 15), heading: 90 } });
  }
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

    if (s.cancel === 'pending') {
      await put(`${API.trips}/trips/${tripId}/cancel`, { ...P, body: { reason: 'Ya no necesito el viaje' } });
      ok('Viaje', label, 'cancelado por pasajero antes de asignar'); tripsLog.push({ ...s, tripId, fare, final: 'cancelado' }); return;
    }
    if (s.leavePending) { ok('Viaje', label, 'queda pendiente buscando conductor'); tripsLog.push({ ...s, tripId, fare, final: 'pendiente' }); return; }

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
      await put(`${API.trips}/trips/${tripId}/accept-proposal/${r1.proposalId}`, P);
      await put(`${API.trips}/trips/${tripId}/confirm-acceptance/${r1.proposalId}`, D);
      finalFare = offer;
    } else if (s.mode === 'counter') {
      const counter = Math.max(5, Math.round((fare - 1.5) * 2) / 2);
      await post(`${API.trips}/trips/${tripId}/counter`, { ...P, body: { driverId: d.userId, fare: counter } });
      await put(`${API.trips}/trips/${tripId}/accept`, D);
      finalFare = counter;
    } else if (s.mode === 'driverAccept') {
      const r = await post(`${API.trips}/trips/${tripId}/driver-accept`, D);
      await put(`${API.trips}/trips/${tripId}/confirm-driver-acceptance/${r.proposalId}`, P);
    } else {
      await put(`${API.trips}/trips/${tripId}/accept`, D);
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
      await pingRoute(d, tripId, d.at, from, 3).catch(() => {});
      await put(`${API.trips}/trips/${tripId}/arrived`, D).catch(() => {});
      const c = await put(`${API.trips}/trips/${tripId}/cancel`, { ...D, body: { reason: 'El pasajero no se presenta' } });
      if (c?.cancelledBy === 'driver') ok('Viaje', label, `cancelado por el CONDUCTOR (motivo: ${c.cancelReason})`);
      else fail('Viaje', `${label} cancelledBy`, `quedo como "${c?.cancelledBy}"`);
      tripsLog.push({ ...s, tripId, fare, final: 'cancelado' }); return;
    }

    // conductor va al punto de recojo y avisa "Ya llegue" (push al pasajero)
    await pingRoute(d, tripId, d.at, from, 4);
    if (!s.noArrive) {
      await put(`${API.trips}/trips/${tripId}/arrived`, D);
      const act = await get(`${API.trips}/trips/active`, P).catch(() => null);
      if (!act?.driverArrivedAt) fail('Llegada', `${label} driverArrivedAt`, 'el pasajero no ve la llegada');
    }
    // Envios: los avisos "recogimos tu paquete" y "entregado" (push + correo)
    // le llegan al remitente. Mientras dura el envio tiene el correo real.
    if (s.delivery) setEmail(p.userId, REAL_EMAIL);
    if (s.delivery) await post(`${API.trips}/trips/${tripId}/pickup-verification`,{ ...D, form: form({ observation: 'Paquete recibido sellado' }, { main: [[imgBlob(`recojo_${s.img}.png`), 'recojo.png']], secondary: [[imgBlob(`recojo2_${s.img}.png`), 'recojo2.png']] }) });

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
      const half = route(from, to, 10).slice(0, 6);
      for (const pt of half) await put(`${API.drivers}/drivers/location`, { ...D, body: { driverId: d.driverId, lat: pt.lat, lng: pt.lng, tripId, speedKmh: 32, heading: 120 } });
      ok('Viaje', label, 'queda EN CURSO (seguimiento en mapa)'); tripsLog.push({ ...s, tripId, fare, final: 'en curso' }); return;
    }

    await pingRoute(d, tripId, from, to, 10);

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
      const rec = s.recipient ?? 'Recepcion del destino';
      await post(`${API.trips}/trips/${tripId}/delivery-confirmation`, { ...D, form: form({ receivedBy: rec }, { photo: [[imgBlob(`entrega_${s.img}.png`), 'entrega.png']] }) });
      ok('Envio', `${label} entrega confirmada`, `recibio: ${rec} · correos "recogido" y "entregado" a ${REAL_EMAIL}`);
      await sleep(4000); // el aviso se envia en segundo plano
      setEmail(p.userId, p.email);
      // Las fotos solo las ven pasajero, conductor del viaje o admin
      const otro = drivers.find(x => x.status === 'approved' && x.key !== s.d);
      const visto = await get(`${API.trips}/trips/${tripId}/photos`, { token: otro.token }).then(() => true).catch(e => e.status !== 403);
      if (visto) fail('Envio', 'fotos visibles para otro conductor', 'deberia ser 403');
    }
    await put(`${API.trips}/trips/${tripId}/complete`, D);
    const done = await get(`${API.trips}/trips/${tripId}`, P).catch(() => null);
    ok('Viaje', label, `completado S/ ${done?.finalFare ?? finalFare} ${s.method ?? 'cash'}${coupon ? ` con cupon (antes S/ ${done?.fareBeforeDiscount ?? '?'})` : ''}`);

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
  // segunda tanda: tras canjear puntos -> viajes con cupon
  { p: 'P1', d: 'D3', from: 'aeropuerto', to: 'paseo', method: 'cash', mode: R, scenario: 'con cupon', coupon: true, stars: 5 },
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
const TRIPS_FINAL = [
  // estados vivos para la demo
  { p: 'P2', d: 'D1', from: 'plaza', to: 'aeropuerto', method: 'yape', mode: R, scenario: 'EN CURSO para mapa', leaveInProgress: true },
  { p: 'P4', d: 'D2', from: 'hospital', to: 'pocollay', method: 'cash', mode: R, scenario: 'PENDIENTE buscando conductor', leavePending: true },
  // programados aceptados para manana (no bloquean al conductor ni al pasajero)
  { p: 'P1', d: 'D3', from: 'plaza', to: 'aeropuerto', method: 'cash', mode: R, scenario: 'PROGRAMADO viaje manana 10:00', scheduledHour: 10 },
  { p: 'P3', d: 'D2', from: 'hospital', to: 'terminal', method: 'yape', mode: 'driverAccept', scenario: 'PROGRAMADO envio manana 15:00', scheduledHour: 15,
    delivery: 'Caja con repuestos de celular', recipient: 'Jorge Mamani', fragile: true },
];

async function faseCanjes() {
  console.log('\n== Canjes de puntos');
  await sleep(8000);   // outbox de Trips -> Rewards cada 5 s
  let catalog = [];
  for (const u of [...passengers, ...drivers].filter(x => x.status === 'approved')) {
    try {
      if (!catalog.length) catalog = await get(`${API.rewards}/rewards/catalog`, { token: u.token });
      const me = await get(`${API.rewards}/rewards/me`, { token: u.token });
      const pts = me.availablePoints ?? me.available ?? 0;
      ok('Puntos', `${u.key} tiene ${pts} pts disponibles`, `nivel ${me.currentLevel ?? me.level ?? '?'}`);
      const myCat = await get(`${API.rewards}/rewards/catalog`, { token: u.token });
      const wanted = u.role === 'passenger' ? ['pass_discount_2', 'pass_discount_2'] : ['drv_bonus_5'];
      let left = pts;
      for (const code of wanted) {
        const item = myCat.find(i => i.code === code);
        if (!item || left < item.pointsCost) { fail('Canje', `${u.key} ${code}`, `puntos insuficientes (${left})`); continue; }
        const r = await post(`${API.rewards}/rewards/redeem`, { token: u.token, body: { catalogItemId: item.id } });
        const c = r.redemption?.code ?? r.code;
        (u.coupons ??= []).push(c); (u.redeemed ??= []).push(c);
        left = r.availablePointsAfter ?? left - item.pointsCost;
        ok('Canje', `${u.key} canjea ${item.name}`, `cupon ${c}, le quedan ${left} pts`);
      }
    } catch (e) { fail('Canje', u.key, e); }
  }
}

async function faseAdminFinal(raffles) {
  console.log('\n== Admin: revisiones, sorteos, ajustes, contacto');
  const A = { token: adminToken };
  // canjes de conductores: el admin registra el PAGO (metodo, n. operacion) y cierra el canje
  let op = 88210;
  for (const d of drivers.filter(x => x.redeemed?.length)) {
    const code = d.redeemed[0];
    const method = op % 2 ? 'yape' : 'plin';
    try {
      // El correo "te pagamos" llega al correo real mientras se registra el pago
      setEmail(d.userId, REAL_EMAIL);
      const pago = await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
        driverId: d.userId, driverName: d.name, amount: 5, method, operationNumber: String(++op),
        sourceType: 'reward_redemption', sourceRef: code, note: 'Bono S/ 5 por puntos' } });
      await put(`${API.rewards}/rewards/admin/redemptions/${code}/use`, { ...A, body: { note: `Pagado por ${method} · op ${pago.operationNumber} · S/ 5.00` } });
      ok('Pago', `bono ${code} de ${d.key} pagado por ${method}`, `op ${pago.operationNumber} · correo a ${REAL_EMAIL}`);
      await sleep(8000); // el aviso (push + correo) se envia en segundo plano (SMTP tarda)
      setEmail(d.userId, d.email);
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
    setEmail(byKey.D2.userId, REAL_EMAIL);
    await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
      driverId: byKey.D2.userId, driverName: byKey.D2.name, amount: 20, method: 'efectivo',
      sourceType: 'manual', note: 'Bono por mejor calificacion del mes' } });
    ok('Pago', 'pago manual en efectivo a D2', `S/ 20 · correo a ${REAL_EMAIL}`);
    await sleep(8000);
    setEmail(byKey.D2.userId, byKey.D2.email);
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
  // sorteos: repartir tickets, sortear el mensual y entregar premio
  try { const r = await post(`${API.rewards}/rewards/admin/raffles/maintenance?draw=false`, A); ok('Sorteo', 'repartir tickets (mantenimiento)', JSON.stringify(r).slice(0, 150)); }
  catch (e) { fail('Sorteo', 'repartir tickets', e); }
  try {
    const list = await get(`${API.rewards}/rewards/admin/raffles`, A);
    const monthly = list.find(r => r.raffleType === 'monthly');
    for (const r of list) ok('Sorteo', `"${r.name}"`, `${r.ticketsNow} tickets`);
    if (monthly) {
      await post(`${API.rewards}/rewards/admin/raffles/${monthly.id}/draw`, A);
      const after = (await get(`${API.rewards}/rewards/admin/raffles`, A)).find(r => r.id === monthly.id);
      const w = after.winners?.[0];
      ok('Sorteo', `se sortea "${monthly.name}"`, w ? `ganador ticket ${w.ticketNumber}` : 'sin ganador');
      if (w) { await put(`${API.rewards}/rewards/admin/raffles/winners/${w.id}/deliver`, { ...A, body: { note: 'Premio entregado como saldo de viajes' } }); ok('Sorteo', 'premio entregado', `a ${w.userName ?? w.userId}`); }
    }
    // sorteo de conductores: el premio se paga en dinero y queda en el reporte
    const weekly = list.find(r => r.raffleType === 'weekly');
    if (weekly) {
      await post(`${API.rewards}/rewards/admin/raffles/${weekly.id}/draw`, A);
      const after = (await get(`${API.rewards}/rewards/admin/raffles`, A)).find(r => r.id === weekly.id);
      const w = after.winners?.[0];
      if (w) {
        const ganador = drivers.find(x => x.userId === w.userId);
        if (ganador) setEmail(ganador.userId, REAL_EMAIL);
        await post(`${API.payments}/payments/admin/payouts`, { ...A, body: {
          driverId: w.userId, driverName: w.userName, amount: weekly.prizeValue ?? 120, method: 'transferencia',
          operationNumber: '00045871', sourceType: 'raffle_prize', sourceRef: w.id, note: 'Premio sorteo semanal' } });
        await put(`${API.rewards}/rewards/admin/raffles/winners/${w.id}/deliver`, { ...A, body: { note: 'Pagado por transferencia · op 00045871' } });
        ok('Sorteo', `sorteo semanal: ganó ${w.userName}`, `premio pagado por transferencia · correo a ${REAL_EMAIL}`);
        await sleep(8000);
        if (ganador) setEmail(ganador.userId, ganador.email);
      }
    }
  } catch (e) { fail('Sorteo', 'sortear / entregar', e); }
  // bono sin cancelaciones (usa endpoint interno de Trips)
  try { const today = new Date().toISOString().slice(0, 10); const r = await post(`${API.rewards}/rewards/admin/no-cancellations/run?date=${today}`, A); ok('Rewards', 'bono sin cancelaciones', JSON.stringify(r).slice(0, 150)); }
  catch (e) { fail('Rewards', 'bono sin cancelaciones', e); }
  // referidos: invitacion por correo
  try { await post(`${API.rewards}/rewards/me/referral/invite`, { token: byKey.P1.token, body: { email: REAL_EMAIL } }); ok('Referido', 'P1 invita por correo', `correo de invitacion a ${REAL_EMAIL}`); }
  catch (e) { fail('Referido', 'invitacion por correo', e); }
  // contacto web + respuesta del admin
  try {
    const c = await post(`${API.landing}/landing/contact`, { body: { name: 'Usuario de prueba Bugie', email: REAL_EMAIL, subject: 'Consulta', message: 'Hola, quisiera saber si Bugie opera en Pocollay los fines de semana.' } });
    ok('Contacto', 'mensaje desde la web', 'correo de aviso al admin');
    await put(`${API.landing}/landing/contact/${c.id}/read`, A).catch(e => fail('Contacto', 'marcar leido', e));
    await post(`${API.landing}/landing/contact/${c.id}/reply`, { ...A, body: { subject: 'Re: Consulta', body: 'Hola, si: Bugie opera en Pocollay todos los dias, incluidos fines de semana. Gracias por escribirnos.' } });
    ok('Contacto', 'admin responde', `correo de respuesta a ${REAL_EMAIL}`);
    await post(`${API.landing}/landing/contact`, { body: { name: 'Empresa Logistica Sur', email: 'contacto@logisticasur.test', subject: 'Alianza', message: 'Nos interesa una alianza para envios corporativos en Tacna.' } });
    ok('Contacto', 'segundo mensaje sin leer (para bandeja del admin)');
  } catch (e) { fail('Contacto', 'contacto / respuesta', e); }
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
  const canc = tripsLog.find(t => t.final === 'cancelado');
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
}

// ------------------------------------------------------------------ estados del conductor
async function faseEstadosConductor() {
  console.log('\n== Estados del conductor: suspension, revision, rechazo');
  const A = { token: adminToken };
  // Miguel (D2): suspendido con fecha -> pide revision -> se mantiene -> pide de nuevo -> reactivado
  const m = byKey.D2;
  if (m.driverId && m.token) {
    try {
      await put(`${API.drivers}/drivers/go-offline`, { token: m.token }).catch(() => {});
      await post(`${API.drivers}/drivers/me/presence/checkout`, { token: m.token }).catch(() => {});
      const until = addDays(peruToday(), 3);
      const s = await post(`${API.drivers}/drivers/admin/${m.driverId}/suspend`, { ...A, body: {
        reason: 'Queja de un pasajero por trato descortés; se investiga el caso.', until } });
      ok('Estado conductor', `D2 suspendido hasta ${until}`, `estado ${s?.status}`);
      await post(`${API.drivers}/drivers/me/review-request`, { token: m.token, body: { message: 'Fue un malentendido con el pasajero. Tengo el audio del viaje como prueba.' } });
      ok('Estado conductor', 'D2 solicita revision');
      await post(`${API.drivers}/drivers/admin/${m.driverId}/review-request/keep`, { ...A, body: { reason: 'Se mantiene la suspensión hasta revisar el audio del viaje.' } });
      ok('Estado conductor', 'admin mantiene la suspension de D2');
      await post(`${API.drivers}/drivers/me/review-request`, { token: m.token, body: { message: 'Envié el audio al correo de soporte, por favor revisen mi caso.' } });
      ok('Estado conductor', 'D2 solicita revision de nuevo');
      const r = await post(`${API.drivers}/drivers/admin/${m.driverId}/reactivate`, { ...A, body: { reason: 'Se revisó el audio: no hubo falta. Se levanta la suspensión.' } });
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
      setEmail(h.userId, REAL_EMAIL);
      try {
        const r = await post(`${API.drivers}/drivers/admin/${h.driverId}/reject`, { ...A, body: {
          reason: 'La licencia de conducir no tiene la categoría requerida (A-IIa) para taxi.' } });
        ok('Estado conductor', 'admin rechaza el registro de D5', `estado ${r?.status} · correo "registro no aceptado" a ${REAL_EMAIL}`);
        await sleep(8000); // push + correo en segundo plano
      } finally { setEmail(h.userId, h.email); }
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

  // 3) Queja RESPONDIDA (correo real: confirmacion + respuesta)
  try {
    const c = await registrar({ consumerName: 'Usuario de prueba Bugie', docNumber: '45123456', phone: '952123456', email: REAL_EMAIL,
      complaintType: 'queja', reference: 'Demora en el recojo',
      detail: 'El conductor llegó 15 minutos tarde al punto de recojo y no avisó por la app.',
      request: 'Que los conductores avisen cuando se van a demorar.' });
    const it = await hoja(c.code);
    await post(`${API.landing}/landing/admin/complaints/${it.id}/reply`, { ...A, body: { response:
      'Hola, lamentamos la demora. Hablamos con el conductor y reforzamos el aviso de llegada en la app. Te abonamos S/ 5.00 para tu próximo viaje.' } });
    ok('Libro', `queja respondida ${c.code}`, `correos de confirmacion y respuesta a ${REAL_EMAIL}`);
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
  console.log('\n== Cuenta: contrasena y cuenta eliminada');
  // Maria (P3) cambia su contrasena y luego vuelve a 10203040 (todos deben quedar con 10203040)
  const p3 = byKey.P3, OTRA = 'Tacna2026Bugie';
  try {
    await post(`${API.auth}/auth/me/change-password`, { token: p3.token, body: { currentPassword: PASSWORD, newPassword: OTRA } });
    try {
      const t2 = (await post(`${API.auth}/auth/login`, { body: { email: p3.email, password: OTRA } })).token;
      ok('Cuenta', 'P3 cambia su contrasena', 'inicia sesion con la nueva');
      await post(`${API.auth}/auth/me/change-password`, { token: t2, body: { currentPassword: OTRA, newPassword: PASSWORD } });
    } finally {
      // si algo fallo, igual se intenta dejar 10203040
      await post(`${API.auth}/auth/login`, { body: { email: p3.email, password: PASSWORD } }).catch(async () => {
        const t = (await post(`${API.auth}/auth/login`, { body: { email: p3.email, password: OTRA } })).token;
        await post(`${API.auth}/auth/me/change-password`, { token: t, body: { currentPassword: OTRA, newPassword: PASSWORD } });
      });
    }
    p3.token = await login(p3.email);
    ok('Cuenta', 'P3 vuelve a la contrasena 10203040');
  } catch (e) { fail('Cuenta', 'cambio de contrasena de P3', e); }
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

// ================================================================== main
const t0 = Date.now();
try {
  generarImagenes();
  await faseAdmin();
  const raffles = await faseRewardsConfig();
  await fasePasajeros();
  await faseConductores();
  console.log('\n== Viajes (tanda 1)');
  for (const s of TRIPS_A) await runTrip(s);
  await faseCanjes();
  console.log('\n== Viajes (tanda 2, con cupones)');
  for (const s of TRIPS_B) await runTrip(s);
  await sleep(8000);
  await faseAdminFinal(raffles);
  await faseEstadosConductor();
  await faseLibro();
  await faseCuentas();
  console.log('\n== Estados finales para la demo');
  for (const s of TRIPS_FINAL) await runTrip(s);
  await faseBandeja();
} catch (e) { fail('General', 'error no controlado', e); }

const out = join(HERE, 'logs'); mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'seed-resultado.json'), JSON.stringify({ report, trips: tripsLog,
  users: [...passengers, ...drivers].map(({ token, docs, ...u }) => u) }, null, 2));
const bad = report.filter(r => !r.ok);
console.log(`\nListo en ${Math.round((Date.now() - t0) / 1000)} s — ${report.length - bad.length} OK, ${bad.length} con error.`);
