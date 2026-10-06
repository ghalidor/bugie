-- =====================================================================
-- Negociacion pasajero-conductor (2026-10-05)
--
-- 1. trips.trips
--    - suggestedfare: tarifa que pidio el pasajero al crear el viaje
--      (EstimatedFare cambia al asignar). Base del maximo al negociar.
--      Se llena con estimatedfare en los viajes que siguen buscando
--      conductor; en el resto queda NULL y el codigo usa estimatedfare.
--    - publishedat: cuando se publico (o republico) para buscar conductor.
--      Desde aqui corre el plazo para cancelar un viaje inmediato que nadie
--      toma. A los viajes que hoy siguen buscando se les pone la hora actual
--      (tienen el plazo completo desde que se aplica este script); el resto
--      queda NULL y el codigo usa createdat.
--
-- 2. trips.tripproposals
--    - acceptedbypassengerat: cuando el pasajero acepto la oferta. Desde aqui
--      corre el plazo del conductor para confirmar (antes se usaba createdat).
--    - Indice unico parcial: una sola oferta 'accepted_by_passenger' por viaje.
--      Si hubiera duplicados, se deja la mas reciente y las demas pasan a
--      rejected / driver_no_confirm.
--
-- 3. landing.systemsettings (Admin > Configuracion):
--    - fare_max_multiplier                 = 3
--    - trip_no_driver_cancel_min           = 10
--    - driver_confirm_immediate_min        = 2
--    - driver_confirm_scheduled_before_min = 60
--
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- -- 1. Viajes ---------------------------------------------------------
ALTER TABLE trips.trips ADD COLUMN IF NOT EXISTS suggestedfare numeric(10,2) NULL;
ALTER TABLE trips.trips ADD COLUMN IF NOT EXISTS publishedat timestamp without time zone NULL;

UPDATE trips.trips
   SET suggestedfare = estimatedfare
 WHERE suggestedfare IS NULL AND driverid IS NULL AND status IN (1, 7);

UPDATE trips.trips
   SET publishedat = (now() at time zone 'utc')
 WHERE publishedat IS NULL AND driverid IS NULL AND status IN (1, 7);

-- -- 2. Propuestas -----------------------------------------------------
ALTER TABLE trips.tripproposals
    ADD COLUMN IF NOT EXISTS acceptedbypassengerat timestamp without time zone NULL;

UPDATE trips.tripproposals p
   SET status = 'rejected', rejectedby = 'driver_no_confirm'
 WHERE p.status = 'accepted_by_passenger'
   AND EXISTS (SELECT 1 FROM trips.tripproposals q
               WHERE q.tripid = p.tripid
                 AND q.status = 'accepted_by_passenger'
                 AND (q.createdat > p.createdat OR (q.createdat = p.createdat AND q.id > p.id)));

CREATE UNIQUE INDEX IF NOT EXISTS ux_tripproposals_one_accepted_by_passenger
    ON trips.tripproposals (tripid)
    WHERE status = 'accepted_by_passenger';

-- -- 3. Parametros (Admin > Configuracion) ------------------------------
INSERT INTO landing.systemsettings (settingkey, value, description) VALUES
  ('fare_max_multiplier', '3',
   'Tope de precio al negociar: propuesta o contraoferta hasta este numero x la tarifa que pidio el pasajero. El minimo es la tarifa base.'),
  ('trip_no_driver_cancel_min', '10',
   'Minutos que un viaje o envio inmediato espera conductor. Si nadie lo toma, Bugie lo cancela y avisa al pasajero.'),
  ('driver_confirm_immediate_min', '2',
   'Minutos que tiene el conductor para confirmar un viaje inmediato despues de que el pasajero acepta su oferta.'),
  ('driver_confirm_scheduled_before_min', '60',
   'Programados: el conductor debe confirmar la oferta aceptada hasta estos minutos antes de la hora del viaje.')
ON CONFLICT (settingkey) DO NOTHING;

COMMIT;
