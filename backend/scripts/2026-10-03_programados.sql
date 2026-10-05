-- =====================================================================
-- Viajes y envios programados 2026-10-03
--   * trips.trips.scheduledat: hora programada del recojo (UTC).
--     NULL = viaje "ahora" (como siempre).
--   * reminder30sentat / reminder10sentat: marcas de los recordatorios
--     push (30 y 10 min antes) para no mandarlos dos veces.
--   * Indice parcial para el BackgroundService de recordatorios y para
--     el filtro "Programados" del admin.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

ALTER TABLE trips.trips ADD COLUMN IF NOT EXISTS scheduledat      timestamp without time zone;
ALTER TABLE trips.trips ADD COLUMN IF NOT EXISTS reminder30sentat timestamp without time zone;
ALTER TABLE trips.trips ADD COLUMN IF NOT EXISTS reminder10sentat timestamp without time zone;

CREATE INDEX IF NOT EXISTS ix_trips_scheduledat
    ON trips.trips (scheduledat)
    WHERE scheduledat IS NOT NULL;

COMMIT;
