-- ============================================================================
-- Migracion: 006_UserTermsSignature_postgres.sql  (PostgreSQL)
-- Agrega a auth.users las columnas de terminos y firma que usa el registro
-- pero que faltaban en el esquema. Aplicar si tu BD ya existe:
--   psql ... -f 006_UserTermsSignature_postgres.sql
-- ============================================================================
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS TermsAccepted   boolean   NOT NULL DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS TermsAcceptedAt timestamp NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS SignatureImage  text      NULL;
