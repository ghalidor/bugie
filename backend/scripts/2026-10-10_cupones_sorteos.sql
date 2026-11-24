-- =====================================================================
-- Cupones reservados y premios de sorteo por puesto 2026-10-10
--
-- 1) Cupon RESERVADO en un viaje (rewards.redemptions):
--    * status 'reserved': aplicado a un viaje que todavia no termina. Nadie
--      mas lo puede usar, no vence (ExpireOverdue solo toca 'active') y el
--      admin no lo puede anular mientras el viaje siga.
--    * reservedtripid / reservedat: viaje y momento de la reserva.
--    Al completar el viaje pasa a 'used'; al quitarlo o cancelar el viaje
--    vuelve a 'active' (o 'expired' si ya paso su fecha).
--    Los cupones ya aplicados hoy a viajes activos (pendiente, negociando,
--    aceptado, en curso o SOS) pasan a 'reserved' para ese viaje.
--
-- 2) Bandeja de salida de Trips (trips.outboxevents):
--    * nextattemptat: espera creciente entre reintentos. Si Rewards esta
--      caido el evento se sigue reintentando (ya no se marca 'failed' por
--      caida), asi no se pierde el uso de un cupon ni unos puntos.
--
-- 3) Premios de sorteo por puesto:
--    * rewards.raffles.secondaryprizedescription / secondaryprizevalue:
--      premio de los puestos 2 en adelante (null = sin monto: el admin
--      escribe cuanto pago).
--    * rewards.rafflewinners.prizevalue: valor del premio de ESE puesto,
--      copiado al sortear. Los ganadores ya sorteados: el puesto 1 toma el
--      valor del sorteo; los puestos 2+ quedan sin monto (antes se pagaban
--      con el valor del principal por error).
--
-- Requisito: 2026-10-08_fechas_timestamptz.sql ya aplicado (columnas nuevas
-- en timestamptz). Solo cambios aditivos; no borra datos.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- -- 1. Cupones reservados --------------------------------------------

ALTER TABLE rewards.redemptions
    ADD COLUMN IF NOT EXISTS reservedtripid uuid,
    ADD COLUMN IF NOT EXISTS reservedat     timestamp with time zone;

ALTER TABLE rewards.redemptions DROP CONSTRAINT IF EXISTS ck_redemptions_status;
ALTER TABLE rewards.redemptions ADD CONSTRAINT ck_redemptions_status
    CHECK (status IN ('active', 'reserved', 'used', 'expired', 'cancelled'));

ALTER TABLE rewards.redemptions DROP CONSTRAINT IF EXISTS ck_redemptions_reserved_trip;
ALTER TABLE rewards.redemptions ADD CONSTRAINT ck_redemptions_reserved_trip
    CHECK (status <> 'reserved' OR reservedtripid IS NOT NULL);

CREATE INDEX IF NOT EXISTS ix_redemptions_reserved
    ON rewards.redemptions (reservedtripid) WHERE status = 'reserved';

COMMENT ON COLUMN rewards.redemptions.reservedtripid IS
    'Viaje al que esta aplicado el cupon mientras status = reserved (no vence ni se anula hasta que el viaje termine o se cancele).';
COMMENT ON COLUMN rewards.redemptions.reservedat IS
    'Momento en que se reservo el cupon para el viaje.';

-- Cupones ya aplicados a viajes activos: pasan a 'reserved' para ese viaje.
-- Si un mismo codigo quedo en dos viajes activos (el error que esto corrige),
-- se reserva para el mas antiguo; el otro se informa abajo.
-- trips.trips.status: 1 pendiente, 7 negociando, 2 aceptado, 3 en curso, 6 SOS.
WITH aplicados AS (
    SELECT DISTINCT ON (upper(t.couponcode))
           upper(t.couponcode) AS code, t.id AS tripid
      FROM trips.trips t
     WHERE t.couponcode IS NOT NULL
       AND t.status IN (1, 2, 3, 6, 7)
     ORDER BY upper(t.couponcode), COALESCE(t.acceptedat, t.createdat), t.id
)
UPDATE rewards.redemptions r
   SET status = 'reserved', reservedtripid = a.tripid, reservedat = now()
  FROM aplicados a
 WHERE upper(r.code) = a.code
   AND r.status IN ('active', 'expired');

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
      FROM trips.trips t
      JOIN rewards.redemptions r ON upper(r.code) = upper(t.couponcode)
     WHERE t.status IN (1, 2, 3, 6, 7)
       AND r.status = 'reserved' AND r.reservedtripid <> t.id;
    IF n > 0 THEN
        RAISE NOTICE '% viaje(s) activo(s) llevan un cupon reservado para OTRO viaje: revisarlos a mano.', n;
    END IF;
END $$;

-- -- 2. Bandeja de salida de Trips: reintentos con espera -------------

ALTER TABLE trips.outboxevents
    ADD COLUMN IF NOT EXISTS nextattemptat timestamp with time zone;

COMMENT ON COLUMN trips.outboxevents.nextattemptat IS
    'Proximo intento de entrega (espera creciente). NULL = cuanto antes.';

-- -- 3. Premios de sorteo por puesto ----------------------------------

ALTER TABLE rewards.raffles
    ADD COLUMN IF NOT EXISTS secondaryprizedescription text,
    ADD COLUMN IF NOT EXISTS secondaryprizevalue       numeric(10,2);

ALTER TABLE rewards.raffles DROP CONSTRAINT IF EXISTS ck_raffles_secondary_value;
ALTER TABLE rewards.raffles ADD CONSTRAINT ck_raffles_secondary_value
    CHECK (secondaryprizevalue IS NULL OR secondaryprizevalue >= 0);

COMMENT ON COLUMN rewards.raffles.secondaryprizedescription IS
    'Premio de los puestos 2 en adelante. NULL = "Premio secundario #n".';
COMMENT ON COLUMN rewards.raffles.secondaryprizevalue IS
    'Valor en soles del premio de los puestos 2+. NULL = sin monto fijo (el admin escribe cuanto pago).';

ALTER TABLE rewards.rafflewinners
    ADD COLUMN IF NOT EXISTS prizevalue numeric(10,2);

COMMENT ON COLUMN rewards.rafflewinners.prizevalue IS
    'Valor en soles del premio de este puesto, copiado al sortear. NULL = sin monto fijo.';

-- Ganadores ya sorteados: solo el puesto 1 hereda el valor del sorteo.
UPDATE rewards.rafflewinners w
   SET prizevalue = r.prizevalue
  FROM rewards.raffles r
 WHERE r.id = w.raffleid
   AND w.prizerank = 1
   AND w.prizevalue IS NULL
   AND r.prizevalue IS NOT NULL;

-- -- Registro ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-10_cupones_sorteos')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
