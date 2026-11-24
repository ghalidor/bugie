-- =====================================================================
-- Correcciones del motor de puntos 2026-10-10 (Rewards)
--
-- 1. rewards.tripactivity: un registro por (usuario, viaje) completado, con
--    la hora REAL del viaje (completedat). Lo escribe Rewards al recibir
--    trip.completed, aunque el viaje no de puntos (viaje 100% con cupon).
--    Es la base de:
--      * racha de dias seguidos y meta semanal (dias/semana en hora de Peru
--        segun completedat, no segun la hora de acreditacion),
--      * "primer viaje del dia" de las promociones,
--      * viajes del referido (la PK impide contar dos veces el mismo viaje).
--    Se carga con los viajes completados que ya existen en trips.trips.
--
-- 2. rewards.nocancellationruns: dias ya evaluados por el bono "dia sin
--    cancelar". Si Trips no responde, el dia queda pendiente y el job se pone
--    al dia (hasta 7 dias atras) cuando Trips vuelve.
--
-- Solo agrega estructura y datos derivados; no borra ni cambia datos.
-- Requisito: 2026-10-08_fechas_timestamptz.sql (columnas timestamptz).
-- Se puede ejecutar varias veces (idempotente). Volver a correrlo despues de
-- test-data/03_repartir_fechas.sql: re-sincroniza completedat con trips.trips.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rewards.tripactivity (
    userid      uuid                     NOT NULL,
    tripid      uuid                     NOT NULL,
    usertype    varchar(10)              NOT NULL,
    completedat timestamp with time zone NOT NULL,
    createdat   timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_tripactivity PRIMARY KEY (userid, tripid),
    CONSTRAINT ck_tripactivity_usertype CHECK (usertype IN ('passenger', 'driver')),
    CONSTRAINT fk_tripactivity_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_tripactivity_user_completed
    ON rewards.tripactivity (userid, completedat DESC);

COMMENT ON TABLE rewards.tripactivity IS
    'Viajes completados por usuario (pasajero y conductor), con la hora real del viaje. Base de racha, meta semanal, primer viaje del dia y referidos.';

-- Carga inicial / re-sincronizacion con los viajes completados (status 4 = Completed).
INSERT INTO rewards.tripactivity (userid, tripid, usertype, completedat)
SELECT t.passengerid, t.id, 'passenger', t.completedat
FROM trips.trips t
JOIN auth.users u ON u.id = t.passengerid
WHERE t.completedat IS NOT NULL AND t.status = 4
ON CONFLICT (userid, tripid) DO UPDATE SET completedat = EXCLUDED.completedat;

INSERT INTO rewards.tripactivity (userid, tripid, usertype, completedat)
SELECT t.driverid, t.id, 'driver', t.completedat
FROM trips.trips t
JOIN auth.users u ON u.id = t.driverid
WHERE t.completedat IS NOT NULL AND t.status = 4 AND t.driverid IS NOT NULL
ON CONFLICT (userid, tripid) DO UPDATE SET completedat = EXCLUDED.completedat;

CREATE TABLE IF NOT EXISTS rewards.nocancellationruns (
    day            date                     NOT NULL,
    driverschecked integer                  NOT NULL DEFAULT 0,
    awarded        integer                  NOT NULL DEFAULT 0,
    processedat    timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_nocancellationruns PRIMARY KEY (day)
);

COMMENT ON TABLE rewards.nocancellationruns IS
    'Dias (hora de Peru) ya evaluados por el bono de dia sin cancelar. Permite ponerse al dia si Trips no respondio.';

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-10_puntos_correcciones')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
