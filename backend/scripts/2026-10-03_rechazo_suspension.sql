-- =====================================================================
-- Rechazo, suspension y reactivacion de conductores (2026-10-03)
-- - drivers.drivers: motivo del ultimo rechazo/suspension y fin de la
--   suspension.
-- - drivers.approvalaudit: nuevas acciones (linea de tiempo de estados),
--   estado anterior/nuevo y quien hizo la accion (admin, sistema, conductor).
-- - drivers.driverreviewrequests: solicitudes de revision del conductor
--   (solo una abierta a la vez por conductor).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) drivers.drivers
--    suspendeduntil: fin de la suspension en UTC (= 23:59:59 hora de Peru
--                    del dia elegido por el admin). NULL = sin fecha
--                    (indefinida) o no suspendido.
--    statusreason:   motivo del ultimo rechazo/suspension (lo ve el conductor).
-- ---------------------------------------------------------------------
ALTER TABLE drivers.drivers
    ADD COLUMN IF NOT EXISTS suspendeduntil timestamp without time zone,
    ADD COLUMN IF NOT EXISTS statusreason   text;

CREATE INDEX IF NOT EXISTS ix_drivers_suspendeduntil
    ON drivers.drivers (suspendeduntil)
    WHERE suspendeduntil IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) drivers.approvalaudit
--    fromstatus / tostatus: estado antes y despues (1..6, NULL si no cambia).
--    actorrole: admin | system | driver (NULL en registros antiguos).
--    Nuevas acciones: rejected, suspended, reactivated, auto_reactivated,
--                     review_requested, review_kept, expired.
-- ---------------------------------------------------------------------
ALTER TABLE drivers.approvalaudit
    ADD COLUMN IF NOT EXISTS fromstatus smallint,
    ADD COLUMN IF NOT EXISTS tostatus   smallint,
    ADD COLUMN IF NOT EXISTS actorrole  character varying(20);

ALTER TABLE drivers.approvalaudit DROP CONSTRAINT IF EXISTS ck_approvalaudit_action;
ALTER TABLE drivers.approvalaudit ADD CONSTRAINT ck_approvalaudit_action CHECK (action IN
    ('approved', 'approved_exception', 'documents_completed', 'auto_deactivated',
     'rejected', 'suspended', 'reactivated', 'auto_reactivated',
     'review_requested', 'review_kept', 'expired'));

-- ---------------------------------------------------------------------
-- 3) drivers.driverreviewrequests
--    status: open     = esperando respuesta del admin
--            accepted = el admin reactivo al conductor (o termino la suspension)
--            rejected = el admin mantuvo el rechazo/suspension
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers.driverreviewrequests (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid         uuid NOT NULL,
    message          text NOT NULL,
    status           character varying(20) DEFAULT 'open' NOT NULL,
    driverstatus     smallint NOT NULL,
    createdat        timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    resolvedat       timestamp without time zone,
    resolvedbyuserid uuid,
    resolvedbyname   character varying(150),
    resolution       text,
    CONSTRAINT driverreviewrequests_pkey PRIMARY KEY (id),
    CONSTRAINT fk_driverreviewrequests_driver FOREIGN KEY (driverid)
        REFERENCES drivers.drivers (id) ON DELETE CASCADE,
    CONSTRAINT ck_driverreviewrequests_status CHECK (status IN ('open', 'accepted', 'rejected'))
);

-- Solo una solicitud abierta por conductor
CREATE UNIQUE INDEX IF NOT EXISTS ux_driverreviewrequests_open
    ON drivers.driverreviewrequests (driverid)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS ix_driverreviewrequests_driver
    ON drivers.driverreviewrequests (driverid, createdat DESC);

COMMIT;
