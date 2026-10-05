-- =====================================================================
-- Bandeja de notificaciones del usuario (pasajero y conductor) (2026-10-03)
-- - trips.usernotifications: una fila por cada push VISIBLE enviado a un
--   usuario (la guarda el FcmSender de Trips, aunque el usuario no tenga
--   tokens FCM). La app la muestra en "Notificaciones".
--   CreatedAt / ReadAt en UTC (timestamp sin zona, como el resto).
--   ReadAt NULL = no leida. No se borra nada (sin retencion).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trips.usernotifications (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    userid    uuid NOT NULL,
    title     varchar(200) NOT NULL,
    body      text NOT NULL DEFAULT '',
    type      varchar(60),
    alerttype varchar(30),
    route     varchar(300),
    data      jsonb,
    createdat timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    readat    timestamp without time zone
);

-- Listado de la bandeja: del usuario, lo mas reciente primero.
CREATE INDEX IF NOT EXISTS ix_usernotifications_user_created
    ON trips.usernotifications (userid, createdat DESC);

-- Contador de no leidas y "marcar todas como leidas".
CREATE INDEX IF NOT EXISTS ix_usernotifications_user_unread
    ON trips.usernotifications (userid)
    WHERE readat IS NULL;

COMMIT;
