-- =====================================================================
-- Reparte en los ultimos 30 dias los datos generados por seed.mjs.
--
-- seed.mjs crea todo en ~2 minutos. Este script:
--   * pone cada viaje completado/cancelado en su propio momento, repartidos
--     entre hace 25 dias y ayer, en horario de 07:00 a 22:00;
--   * a cada viaje le da una duracion realista (12 a 30 min) y mueve con el
--     todo lo suyo: propuestas, recorrido GPS, pago, calificacion, incidente,
--     SOS, fotos y puntos ganados;
--   * intercala en orden lo demas (canjes, ajustes, sorteos, contacto);
--   * deja el registro/activacion de usuarios en los dias previos.
--
-- No se tocan:
--   * configuracion previa al seed (landing, catalogo, niveles)
--   * el viaje EN CURSO y el PENDIENTE (quedan hoy, para la demo del mapa)
--   * presencia y ubicacion actual de los conductores (siguen en linea)
--   * vencimientos de documentos, fechas de promociones y de sorteos
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
UPDATE trips.trips t SET
    acceptedat          = pg_temp.ft(t.id, t.acceptedat),
    driverarrivedat     = pg_temp.ft(t.id, t.driverarrivedat),
    startedat           = pg_temp.ft(t.id, t.startedat),
    completedat         = pg_temp.ft(t.id, t.completedat),
    passengerlocationat = pg_temp.ft(t.id, t.passengerlocationat),
    cancelledat         = pg_temp.ft(t.id, t.cancelledat),
    createdat           = pg_temp.ft(t.id, t.createdat)
 WHERE t.id IN (SELECT id FROM a);

-- ---------------------------------------------------------------- 4) eventos sueltos
UPDATE auth.users              SET createdat = pg_temp.f(createdat), termsacceptedat = pg_temp.f(termsacceptedat);
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

COMMIT;
