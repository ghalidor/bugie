-- =====================================================================
-- Indices de rendimiento (2026-10-06)
--
-- Objetivo: 500 conductores en viaje + 1.000 conectados. Las consultas mas
-- frecuentes (viaje activo por usuario, historial por pasajero/conductor,
-- viajes pendientes, ofertas por viaje/conductor, recorrido por viaje,
-- pagos por viaje/conductor) hoy recorren las tablas completas.
--
-- 1. trips.trips
--    - (passengerid, createdat desc) y (driverid, createdat desc): viaje
--      activo (GetActiveTripAsync) e historial por usuario.
--    - (status) parcial, status IN (1,7,2,3,6): pendientes, en negociacion,
--      aceptados, en curso y SOS (lo que listan monitoreo, pendientes y jobs).
--    - (driverid) parcial, status IN (2,3,6): conductores con viaje activo
--      (GetDriversWithActiveTripAsync, mapa del admin).
-- 2. trips.tripproposals: (tripid, status) y (driverid, status).
-- 3. drivers.locationhistory: (tripid, recordedat) para el recorrido de un
--    viaje y (driverid, recordedat desc) para la ultima posicion/auditoria.
--    Si la tabla ya esta particionada (2026-10-06_historial_gps.sql), el
--    indice se crea particionado; si se particiona despues, ese script copia
--    los indices existentes.
-- 4. payments.payments: (driverid, createdat desc) y (passengerid, createdat
--    desc). (tripid) ya existe como unico (uq_payment_trip).
-- 5. rewards.pointstransactions (profileid, createdat desc) y
--    trips.usernotifications (userid, createdat desc) ya existen: no se tocan.
--
-- Sin CONCURRENTLY para poder correrlo dentro de una transaccion y repetirlo
-- sin problema (IF NOT EXISTS). En produccion con tablas muy grandes se puede
-- correr cada CREATE INDEX con CONCURRENTLY fuera de la transaccion.
-- =====================================================================

BEGIN;

-- -- 1. Viajes ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_trips_passenger_created
    ON trips.trips (passengerid, createdat DESC);

CREATE INDEX IF NOT EXISTS ix_trips_driver_created
    ON trips.trips (driverid, createdat DESC);

CREATE INDEX IF NOT EXISTS ix_trips_status_activos
    ON trips.trips (status)
    WHERE status IN (1, 7, 2, 3, 6);

CREATE INDEX IF NOT EXISTS ix_trips_driver_en_viaje
    ON trips.trips (driverid)
    WHERE status IN (2, 3, 6);

-- -- 2. Ofertas --------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_tripproposals_trip_status
    ON trips.tripproposals (tripid, status);

CREATE INDEX IF NOT EXISTS ix_tripproposals_driver_status
    ON trips.tripproposals (driverid, status);

-- -- 3. Historial GPS --------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_locationhistory_trip_recorded
    ON drivers.locationhistory (tripid, recordedat);

CREATE INDEX IF NOT EXISTS ix_locationhistory_driver_recorded
    ON drivers.locationhistory (driverid, recordedat DESC);

-- -- 4. Pagos ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_payments_driver_created
    ON payments.payments (driverid, createdat DESC);

CREATE INDEX IF NOT EXISTS ix_payments_passenger_created
    ON payments.payments (passengerid, createdat DESC);

COMMIT;
