-- =====================================================================
-- Historial de avisos del panel admin (2026-10-04)
-- - trips.adminnotifications: una fila por cada aviso EN VIVO que Trips
--   envia por SignalR a los admins:
--     * los que llegan por POST /api/internal/admin-events (contacto,
--       reclamacion, conductor/pasajero por revisar...) -> "admin:event";
--     * los desvios de ruta nuevos ("deviation:new", tipo 'deviation').
--   Permission = codigo de permiso necesario para verlo (ej. view:messages);
--   NULL = lo ven todos los admins. super_admin ve todo.
--   Los recordatorios PERIODICOS (documentos por vencer, pendientes...) los
--   arma el panel con /api/trips/admin/notifications/summary: NO se guardan.
-- - trips.adminnotificationreads: que admin leyo que aviso y cuando.
--   Sin fila = no leido para ese admin.
-- Fechas timestamptz (ver 2026-10-08_fechas_timestamptz.sql). No se borra nada.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trips.adminnotifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type       varchar(40)  NOT NULL,
    title      varchar(200) NOT NULL,
    message    text         NOT NULL DEFAULT '',
    link       varchar(300),
    permission varchar(60),
    data       jsonb,
    createdat  timestamp with time zone NOT NULL DEFAULT now()
);

-- Listado del historial: lo mas reciente primero (y filtro por tipo).
CREATE INDEX IF NOT EXISTS ix_adminnotifications_created
    ON trips.adminnotifications (createdat DESC);
CREATE INDEX IF NOT EXISTS ix_adminnotifications_type_created
    ON trips.adminnotifications (type, createdat DESC);

CREATE TABLE IF NOT EXISTS trips.adminnotificationreads (
    notificationid uuid NOT NULL REFERENCES trips.adminnotifications (id) ON DELETE CASCADE,
    adminuserid    uuid NOT NULL,
    readat         timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (notificationid, adminuserid)
);

-- Contador de no leidos de un admin.
CREATE INDEX IF NOT EXISTS ix_adminnotificationreads_admin
    ON trips.adminnotificationreads (adminuserid);

COMMIT;
