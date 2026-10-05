-- =====================================================================
-- Cierre de sesiones y cuentas desactivadas (2026-10-04)
-- - auth.users.securitystamp: sello de seguridad de la cuenta. El JWT que
--   emite Auth lleva el claim "sst" con este valor. Al cambiarlo se cierran
--   TODAS las sesiones del usuario (las 6 APIs comparan el claim con el
--   sello vigente). Se cambia al: desactivar la cuenta (admin), cambiar la
--   contrasena, restablecerla por correo, eliminar la cuenta y con la accion
--   del admin "Cerrar todas sus sesiones".
-- - auth.users.securitystampchangedat: UTC de la ultima vez que se cambio
--   el sello. NULL = nunca se cambio: los JWT antiguos SIN claim "sst"
--   (emitidos antes de este cambio) siguen valiendo solo mientras sea NULL.
-- - auth.users.deactivatedat / deactivatedreason: cuenta DESACTIVADA por el
--   admin (no puede iniciar sesion ni usar su token). Es distinto de
--   isactive, que tambien vale false para pasajeros/conductores aun no
--   verificados. NULL = no desactivada.
-- - auth.useraccountaudit: acciones nuevas 'deactivated', 'reactivated' y
--   'sessions_revoked'.
-- Fechas en UTC (timestamp sin zona, como el resto). No se borra nada.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS securitystamp uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS securitystampchangedat timestamp without time zone;
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS deactivatedat timestamp without time zone;
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS deactivatedreason character varying(500);

CREATE INDEX IF NOT EXISTS ix_users_deactivatedat
    ON auth.users (deactivatedat) WHERE deactivatedat IS NOT NULL;

ALTER TABLE auth.useraccountaudit DROP CONSTRAINT IF EXISTS ck_useraccountaudit_action;
ALTER TABLE auth.useraccountaudit ADD CONSTRAINT ck_useraccountaudit_action CHECK (action IN
    ('deleted', 'restored', 'document_changed', 'names_changed', 'profile_completed',
     'deactivated', 'reactivated', 'sessions_revoked'));

COMMIT;
