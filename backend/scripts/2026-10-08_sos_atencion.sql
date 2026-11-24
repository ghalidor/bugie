-- =====================================================================
-- Atencion de alertas SOS 2026-10-08
-- Objetivo: medir y auditar el tiempo de respuesta a cada SOS (meta del
-- acta: < 2 min).
--
-- trips.sosalerts gana dos marcas (solo la PRIMERA vez, nunca se pisan):
--   * firstseenat / firstseenby / firstseenbyname: un admin abrio la alerta
--     (detalle en el Centro SOS, o su viaje en Monitoreo).
--   * attendingat / attendingby / attendingbyname: un admin presiono
--     "Atendiendo".
--   *by = UserId del admin (uuid, igual que resolvedby); *byname = su nombre
--   al momento de la marca (queda en el registro de auditoria).
--
-- Tiempo de respuesta = lo primero entre firstseenat y attendingat, menos
-- createdat. Si la alerta se resolvio sin ninguna de las dos marcas, la
-- respuesta es resolvedat y queda como "atencion no registrada".
-- La resolucion (resolved, resolvedby, resolvedat, resolutionreason) no cambia.
--
-- Requisito: 2026-10-08_fechas_timestamptz.sql aplicado (columnas timestamptz).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

ALTER TABLE trips.sosalerts
    ADD COLUMN IF NOT EXISTS firstseenat     timestamp with time zone,
    ADD COLUMN IF NOT EXISTS firstseenby     uuid,
    ADD COLUMN IF NOT EXISTS firstseenbyname text,
    ADD COLUMN IF NOT EXISTS attendingat     timestamp with time zone,
    ADD COLUMN IF NOT EXISTS attendingby     uuid,
    ADD COLUMN IF NOT EXISTS attendingbyname text;

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-08_sos_atencion')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
