-- =====================================================================
-- Aprobacion de conductores con excepcion (2026-10-03)
-- - drivers.drivers: fecha limite para completar documentos y faltas.
-- - drivers.approvalaudit: auditoria de aprobaciones y desactivaciones.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) drivers.drivers
--    documentsdeadline: fecha limite (UTC) para completar los documentos
--                       cuando el admin aprobo por excepcion. NULL = sin plazo.
--    strikes:           faltas acumuladas (no completo a tiempo). Con 1 o mas
--                       ya no se puede aprobar por excepcion.
-- ---------------------------------------------------------------------
ALTER TABLE drivers.drivers
    ADD COLUMN IF NOT EXISTS documentsdeadline timestamp without time zone,
    ADD COLUMN IF NOT EXISTS strikes           integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS ix_drivers_documentsdeadline
    ON drivers.drivers (documentsdeadline)
    WHERE documentsdeadline IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) drivers.approvalaudit
--    action: approved           = aprobacion normal (documentos completos)
--            approved_exception = aprobacion por excepcion (con motivo y plazo)
--            documents_completed= completo documentos antes del plazo
--            auto_deactivated   = desactivado automaticamente por no completar
--    missingdocs: tipos de documento faltantes separados por coma.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers.approvalaudit (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid    uuid NOT NULL,
    action      character varying(30) NOT NULL,
    adminuserid uuid,
    adminname   character varying(150),
    reason      text,
    missingdocs text,
    deadline    timestamp without time zone,
    createdat   timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT approvalaudit_pkey PRIMARY KEY (id),
    CONSTRAINT fk_approvalaudit_driver FOREIGN KEY (driverid)
        REFERENCES drivers.drivers (id) ON DELETE CASCADE,
    CONSTRAINT ck_approvalaudit_action CHECK (action IN
        ('approved', 'approved_exception', 'documents_completed', 'auto_deactivated'))
);

CREATE INDEX IF NOT EXISTS ix_approvalaudit_driver
    ON drivers.approvalaudit (driverid, createdat DESC);

CREATE INDEX IF NOT EXISTS ix_approvalaudit_createdat
    ON drivers.approvalaudit (createdat DESC);

COMMIT;
