-- PostgreSQL. Permite el estado 'driver_accepted' (flujo "aceptar directo" del
-- conductor) en trips.TripProposals, además de los ya usados. Idempotente:
-- busca el CHECK actual sobre Status, lo elimina y lo recrea completo.
--
-- Ejecutar una vez con psql / DBeaver / tu cliente Postgres:
--   psql "<connection string>" -f 004_TripProposals_Status_DriverAccepted.postgres.sql

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel      ON rel.oid = con.conrelid
  JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'trips'
    AND rel.relname = 'tripproposals'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE trips.TripProposals DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE trips.TripProposals
    ADD CONSTRAINT CK_TripProposals_Status
    CHECK (Status IN ('pending', 'accepted', 'rejected', 'superseded',
                      'accepted_by_passenger', 'driver_accepted'));
END $$;
