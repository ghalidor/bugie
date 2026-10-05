-- =====================================================================
-- Reparte en los ultimos 30 dias los datos generados por seed.mjs.
--
-- seed.mjs crea todo en ~2 minutos. Este script:
--   * pone cada viaje completado/cancelado en su propio momento, repartidos
--     entre hace 25 dias y ayer, en horario de 07:00 a 22:00;
--   * a cada viaje le da una duracion realista (12 a 30 min) y mueve con el
--     todo lo suyo: propuestas, recorrido GPS, pago, calificacion, incidente,
--     SOS, fotos y puntos ganados;
--   * intercala en orden lo demas (canjes, ajustes, sorteos, contacto,
--     reclamaciones, estados del conductor, auditoria de cuentas, avisos);
--   * deja el registro/activacion de usuarios en los dias previos;
--   * pone cada conexion CERRADA de un conductor en un dia en que tuvo viajes,
--     cubriendo esos viajes (turno de al menos 3 h).
--
-- No se tocan:
--   * configuracion previa al seed (landing, catalogo, niveles, feriados fijos)
--   * el viaje EN CURSO y el PENDIENTE (quedan hoy, para la demo del mapa)
--   * la conexion ACTIVA y la ubicacion actual de los conductores (siguen en linea)
--   * vencimientos de documentos, fechas de promociones y de sorteos,
--     fin de suspension (SuspendedUntil) y plazos de documentos (Deadline)
--   * lo que el seed hace al final (avisos leidos, viajes programados): queda hoy
--
-- La base guarda en UTC. Los horarios del dia (07:00 a 22:00) son de Peru
-- y se pasan a UTC (+5 h) al guardarlos.
--
-- SOLO para bugie_test. Se ejecuta despues de seed.mjs.
-- =====================================================================
DO $$
BEGIN
  IF current_database() <> 'bugie_test' THEN
    RAISE EXCEPTION 'Este script solo se ejecuta en bugie_test (actual: %)', current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------- 1) anclas
-- Viajes que se mueven, en orden, con su fecha destino.
CREATE TEMP TABLE a ON COMMIT DROP AS
WITH m AS (
  SELECT id, createdat AS c,
         row_number() OVER (ORDER BY createdat) AS k,
         count(*)    OVER ()                    AS n
  FROM trips.trips WHERE status IN (4, 5)
), d AS (
  SELECT *, ((now() AT TIME ZONE 'America/Lima')::date - 25) + ((k - 1) * 25 / n)::int AS dia FROM m
), h AS (
  SELECT *, row_number() OVER (PARTITION BY dia ORDER BY k) AS j,
            count(*)    OVER (PARTITION BY dia)               AS cnt
  FROM d
)
SELECT id, k, c,
       -- hora de Peru (07:00-22:00) + 5 h = UTC
       dia + interval '12 hours' + ((j - 0.5) / cnt) * interval '15 hours'
           + (((k * 53) % 181) - 90) * interval '1 minute'                  AS tgt,
       (12 + (k * 7) % 19) * interval '1 minute'                           AS dur
FROM h;

-- Duracion original de cada viaje (hasta su ultimo evento GPS o fin).
CREATE TEMP TABLE span ON COMMIT DROP AS
SELECT a.id,
       greatest(
         extract(epoch FROM coalesce(t.completedat, t.createdat) - t.createdat),
         coalesce((SELECT extract(epoch FROM max(l.recordedat) - t.createdat) FROM drivers.locationhistory l WHERE l.tripid = a.id), 0),
         0.001) AS secs
FROM a JOIN trips.trips t ON t.id = a.id;

CREATE TEMP TABLE p ON COMMIT DROP AS
SELECT
  (SELECT min(createdat) FROM auth.users WHERE email <> 'admin@bugie.pe')           AS t0,   -- inicio del seed
  (SELECT min(c) FROM a)                                                             AS c1,   -- primer viaje
  (SELECT max(c) FROM a)                                                             AS cn,   -- ultimo viaje movido
  (SELECT min(createdat) FROM trips.trips WHERE status NOT IN (4, 5))                AS k0,   -- viajes que se quedan
  (SELECT min(tgt) FROM a)                                                           AS g1,
  (SELECT max(tgt) FROM a)                                                           AS gn,
  (now() AT TIME ZONE 'utc') - interval '30 days'                                 AS r0,
  (now() AT TIME ZONE 'utc') - interval '3 hours'                                  AS e1;

-- Momento de un evento de un viaje: destino del viaje + tiempo escalado.
CREATE FUNCTION pg_temp.ft(tid uuid, x timestamp) RETURNS timestamp LANGUAGE sql STABLE AS $f$
  SELECT CASE WHEN x IS NULL THEN NULL
              ELSE a.tgt + extract(epoch FROM x - a.c) / s.secs * a.dur END
  FROM a JOIN span s ON s.id = a.id WHERE a.id = tid
$f$;

-- Momento de un evento suelto: interpolado entre viajes (en orden).
CREATE FUNCTION pg_temp.f(x timestamp) RETURNS timestamp LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN x IS NULL OR x < p.t0 OR x >= p.k0 THEN x
    -- registro / activacion: dias previos al primer viaje
    WHEN x < p.c1 THEN p.r0 + (x - p.t0) * (extract(epoch FROM (p.g1 - interval '1 day') - p.r0) / greatest(1, extract(epoch FROM p.c1 - p.t0)))
    -- despues del ultimo viaje movido: hasta hoy - 3 h
    WHEN x >= p.cn THEN p.gn + interval '40 minutes' + (x - p.cn) * (extract(epoch FROM p.e1 - p.gn - interval '40 minutes') / greatest(1, extract(epoch FROM p.k0 - p.cn)))
    -- entre dos viajes: interpolacion
    ELSE (SELECT lo.tgt + interval '35 minutes'
                 + (x - lo.c) * (extract(epoch FROM (hi.tgt - lo.tgt - interval '40 minutes')) / greatest(1, extract(epoch FROM hi.c - lo.c)))
          FROM a lo JOIN a hi ON hi.k = lo.k + 1
          WHERE lo.c <= x AND x < hi.c)
  END
  FROM p
$f$;

-- Evento que puede ser de un viaje (tid puede ser NULL): si cae dentro del
-- viaje (hasta 30 s despues de su fin) usa ft; si no, f.
CREATE FUNCTION pg_temp.fx(tid uuid, x timestamp) RETURNS timestamp LANGUAGE sql STABLE AS $f$
  SELECT coalesce(
    (SELECT pg_temp.ft(tid, x) FROM a JOIN span s ON s.id = a.id
      WHERE a.id = tid AND x <= a.c + (s.secs + 30) * interval '1 second'),
    pg_temp.f(x))
$f$;

-- Viaje al que se refiere un aviso de la bandeja (data.trip_id o data.tripId).
CREATE FUNCTION pg_temp.tid(j jsonb) RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN coalesce(j->>'trip_id', j->>'tripId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN coalesce(j->>'trip_id', j->>'tripId')::uuid END
$f$;

-- Fecha limite de una reclamacion: se corre los mismos dias que su fecha de
-- registro (dia de Peru); si cae en fin de semana pasa al lunes.
CREATE FUNCTION pg_temp.due(d date, c timestamp) RETURNS date LANGUAGE sql STABLE AS $f$
  SELECT CASE WHEN s = 0 THEN d
              ELSE (d + s) + CASE extract(isodow FROM d + s)::int WHEN 6 THEN 2 WHEN 7 THEN 1 ELSE 0 END END
  FROM (SELECT ((pg_temp.f(c) - interval '5 hours')::date - (c - interval '5 hours')::date) AS s) z
$f$;

-- ---------------------------------------------------------------- 2) vencimientos (antes de mover su createdat)
UPDATE rewards.redemptions        SET expiresat  = expiresat  + (pg_temp.f(createdat) - createdat) WHERE expiresat IS NOT NULL;
UPDATE rewards.pointstransactions SET expirydate = expirydate + (coalesce(pg_temp.ft(referenceid, createdat), pg_temp.f(createdat)) - createdat)
 WHERE expirydate IS NOT NULL;
UPDATE rewards.pointsprofiles     SET pointsexpirydate = pointsexpirydate + (pg_temp.f(lastactivitydate) - lastactivitydate)
 WHERE pointsexpirydate IS NOT NULL AND lastactivitydate IS NOT NULL;

-- ---------------------------------------------------------------- 3) eventos de cada viaje
UPDATE trips.tripphotos x SET createdat = (pg_temp.ft(x.tripid, (x.createdat AT TIME ZONE 'UTC')::timestamp)) AT TIME ZONE 'UTC'
 WHERE x.tripid IN (SELECT id FROM a);
UPDATE trips.tripproposals SET createdat = pg_temp.ft(tripid, createdat) WHERE tripid IN (SELECT id FROM a);
UPDATE trips.tripratings   SET createdat = pg_temp.ft(tripid, createdat) WHERE tripid IN (SELECT id FROM a);
UPDATE trips.incidents     SET createdat = pg_temp.ft(tripid, createdat) WHERE tripid IN (SELECT id FROM a);
UPDATE trips.sosalerts     SET createdat = pg_temp.ft(tripid, createdat), resolvedat = pg_temp.ft(tripid, resolvedat) WHERE tripid IN (SELECT id FROM a);
UPDATE trips.passengeracceptancecancellations SET canceledat = pg_temp.ft(tripid, canceledat) WHERE tripid IN (SELECT id FROM a);
UPDATE drivers.locationhistory SET recordedat = pg_temp.ft(tripid, recordedat) WHERE tripid IN (SELECT id FROM a);
UPDATE payments.payments   SET createdat = pg_temp.ft(tripid, createdat), paidat = pg_temp.ft(tripid, paidat) WHERE tripid IN (SELECT id FROM a);
UPDATE rewards.promotionapplications SET createdat = pg_temp.ft(tripid, createdat) WHERE tripid IN (SELECT id FROM a);
UPDATE rewards.pointstransactions    SET createdat = pg_temp.ft(referenceid, createdat) WHERE referenceid IN (SELECT id FROM a);
UPDATE trips.tripplannedroutes SET createdat = pg_temp.fx(tripid, createdat);
UPDATE trips.triproutepoints   SET recordedat = pg_temp.fx(tripid, recordedat);
UPDATE trips.routedeviations   SET startedat = pg_temp.fx(tripid, startedat), endedat = pg_temp.fx(tripid, endedat), reviewedat = pg_temp.f(reviewedat);
UPDATE payments.wallettransactions SET createdat = pg_temp.fx(tripid, createdat), paidat = pg_temp.fx(tripid, paidat);
-- Bandeja: los avisos de un viaje van con su viaje; ReadAt (lo marca el seed al final) queda hoy.
UPDATE trips.usernotifications SET createdat = pg_temp.fx(pg_temp.tid(data), createdat), readat = pg_temp.f(readat);
UPDATE trips.usernotifications SET readat = createdat WHERE readat < createdat;
-- Historial de avisos del admin: el de un desvio va con su viaje (data.tripId); lecturas despues del aviso.
UPDATE trips.adminnotifications SET createdat = pg_temp.fx(pg_temp.tid(data), createdat);
UPDATE trips.adminnotificationreads SET readat = pg_temp.f(readat);
UPDATE trips.adminnotificationreads r SET readat = n.createdat
  FROM trips.adminnotifications n WHERE n.id = r.notificationid AND r.readat < n.createdat;
UPDATE trips.trips t SET
    acceptedat          = pg_temp.ft(t.id, t.acceptedat),
    driverarrivedat     = pg_temp.ft(t.id, t.driverarrivedat),
    startedat           = pg_temp.ft(t.id, t.startedat),
    completedat         = pg_temp.ft(t.id, t.completedat),
    passengerlocationat = pg_temp.ft(t.id, t.passengerlocationat),
    cancelledat         = pg_temp.ft(t.id, t.cancelledat),
    deliveryconfirmedat = pg_temp.ft(t.id, t.deliveryconfirmedat),
    createdat           = pg_temp.ft(t.id, t.createdat)
 WHERE t.id IN (SELECT id FROM a);

-- ---------------------------------------------------------------- 4) eventos sueltos
UPDATE auth.users              SET createdat = pg_temp.f(createdat), termsacceptedat = pg_temp.f(termsacceptedat), deletedat = pg_temp.f(deletedat);
UPDATE auth.useraccountaudit   SET createdat = pg_temp.f(createdat);
UPDATE auth.emergencycontacts  SET createdat = pg_temp.f(createdat), updatedat = pg_temp.f(updatedat);
UPDATE drivers.approvalaudit   SET createdat = pg_temp.f(createdat);
UPDATE drivers.driverreviewrequests SET createdat = pg_temp.f(createdat), resolvedat = pg_temp.f(resolvedat);
UPDATE drivers.vehiclephotos   SET createdat = pg_temp.f(createdat), updatedat = pg_temp.f(updatedat);
UPDATE drivers.documentnotifications SET notifiedat = pg_temp.f(notifiedat);
UPDATE drivers.reviews         SET createdat = pg_temp.f(createdat);
UPDATE payments.driverwallet   SET updatedat = pg_temp.f(updatedat);
UPDATE landing.holidays        SET createdat = pg_temp.f(createdat);
-- DueDate se corre con su fecha de registro (usa los valores ANTERIORES de createdat)
UPDATE landing.complaints      SET duedate = pg_temp.due(duedate, createdat),
                                   createdat = pg_temp.f(createdat), respondedat = pg_temp.f(respondedat), closedat = pg_temp.f(closedat);
UPDATE auth.passengerdocuments SET createdat = pg_temp.f(createdat), reviewedat = pg_temp.f(reviewedat);
UPDATE auth.adminroles         SET createdat = pg_temp.f(createdat);
UPDATE drivers.drivers         SET createdat = pg_temp.f(createdat), approvedat = pg_temp.f(approvedat);
UPDATE drivers.documents       SET createdat = pg_temp.f(createdat), reviewedat = pg_temp.f(reviewedat);
UPDATE drivers.vehicles        SET createdat = pg_temp.f(createdat);
UPDATE trips.outboxevents      SET createdat = pg_temp.f(createdat), sentat = pg_temp.f(sentat);
UPDATE rewards.pointstransactions SET createdat = pg_temp.f(createdat) WHERE referenceid IS NULL OR referenceid NOT IN (SELECT id FROM a);
UPDATE rewards.pointsprofiles     SET createdat = pg_temp.f(createdat), updatedat = pg_temp.f(updatedat), lastactivitydate = pg_temp.f(lastactivitydate);
UPDATE rewards.pointsadjustments  SET createdat = pg_temp.f(createdat);
UPDATE rewards.milestoneawards    SET createdat = pg_temp.f(createdat);
UPDATE rewards.promotions         SET createdat = pg_temp.f(createdat), updatedat = pg_temp.f(updatedat);
UPDATE rewards.raffles            SET createdat = pg_temp.f(createdat), updatedat = pg_temp.f(updatedat), drawnat = pg_temp.f(drawnat);
UPDATE rewards.raffletickets      SET createdat = pg_temp.f(createdat);
UPDATE rewards.rafflewinners      SET createdat = pg_temp.f(createdat), deliveredat = pg_temp.f(deliveredat);
UPDATE rewards.redemptions        SET createdat = pg_temp.f(createdat), usedat = pg_temp.f(usedat);
UPDATE rewards.referralcodes      SET createdat = pg_temp.f(createdat);
UPDATE rewards.referralinvitations SET sentat = pg_temp.f(sentat), acceptedat = pg_temp.f(acceptedat);
UPDATE rewards.referrals          SET createdat = pg_temp.f(createdat), qualifiedat = pg_temp.f(qualifiedat);
UPDATE landing.contactmessages SET createdat = pg_temp.f(createdat), readat = pg_temp.f(readat), lastreplyat = pg_temp.f(lastreplyat);
UPDATE landing.contactreplies  SET createdat = pg_temp.f(createdat);
UPDATE payments.withdrawals    SET createdat = pg_temp.f(createdat), paidat = pg_temp.f(paidat), processedat = pg_temp.f(processedat);

-- ---------------------------------------------------------------- 5) conexiones cerradas de los conductores
-- El seed las crea en segundos. Cada una (en orden) va a un dia distinto en que
-- el conductor tuvo viajes: empieza 20-60 min antes de su primer viaje del dia y
-- termina 25-60 min despues del ultimo (minimo 3 h). Si el conductor no tiene
-- suficientes dias con viajes: turno desde las 08:00 de Peru, de 4 a 6 h.
-- La conexion ACTIVA (CheckedOutAt NULL) no se toca: sigue hoy.
CREATE TEMP TABLE pc ON COMMIT DROP AS
WITH c AS (
  SELECT id, driveruserid AS u,
         row_number() OVER (PARTITION BY driveruserid ORDER BY checkedinat) AS k,
         count(*)    OVER (PARTITION BY driveruserid)                        AS n
  FROM drivers.driverpresencecheckins WHERE checkedoutat IS NOT NULL
), c2 AS (
  SELECT *, ((now() AT TIME ZONE 'America/Lima')::date - 24 + ((k - 1) * 22 / n)::int)
            + interval '13 hours' + ((k * 17) % 90) * interval '1 minute' AS fb
  FROM c
), dd AS (
  SELECT t.driverid AS u, (a.tgt - interval '5 hours')::date AS dia,
         min(a.tgt) AS ini, max(a.tgt + a.dur) AS fin
  FROM a JOIN trips.trips t ON t.id = a.id
  WHERE t.driverid IS NOT NULL
  GROUP BY 1, 2
), dn AS (
  SELECT *, row_number() OVER (PARTITION BY u ORDER BY dia) AS j,
            count(*)    OVER (PARTITION BY u)               AS m
  FROM dd
)
SELECT c2.id,
       coalesce(dn.ini - (20 + (c2.k * 13) % 40) * interval '1 minute', c2.fb) AS cin,
       coalesce(greatest(dn.fin + (25 + (c2.k * 11) % 35) * interval '1 minute', dn.ini + interval '3 hours'),
                c2.fb + (4 + c2.k % 3) * interval '1 hour')                    AS cout
FROM c2
LEFT JOIN dn ON dn.u = c2.u AND dn.m >= c2.n AND dn.j = 1 + ((c2.k - 1) * dn.m) / c2.n;

UPDATE drivers.driverpresencecheckins x
   SET checkedinat = pc.cin, checkedoutat = pc.cout, createdat = pc.cin
  FROM pc WHERE pc.id = x.id;

COMMIT;
