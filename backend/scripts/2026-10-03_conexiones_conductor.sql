-- =====================================================================
-- Conexiones del conductor (03/10/2026)
--
-- Historial de "Conectarme" (drivers.DriverPresenceCheckIns) por conductor:
--   GET /api/drivers/me/presence/history
--   GET /api/drivers/admin/{driverId}/presence
-- Las consultas filtran por conductor y ordenan por fecha de entrada,
-- por eso el indice (DriverUserId, CheckedInAt DESC).
--
-- Idempotente: se puede ejecutar varias veces. No borra filas.
-- =====================================================================

CREATE INDEX IF NOT EXISTS ix_driverpresencecheckins_user_checkedin
    ON drivers.DriverPresenceCheckIns (DriverUserId, CheckedInAt DESC);
