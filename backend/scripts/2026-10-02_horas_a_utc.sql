-- =====================================================================
-- Horas: todo a UTC (una sola vez)
--
-- Desde este cambio el sistema funciona asi:
--   * la base guarda en UTC (las APIs abren la conexion con Timezone=UTC)
--   * las APIs devuelven hora de Peru (America/Lima) sin zona
--
-- Antes, casi todas las fechas quedaban guardadas en hora de Peru (por la
-- zona del servidor de Postgres) y unas pocas en UTC. Este script pasa a UTC
-- (+5 h) las que estaban en hora de Peru y deja igual las que ya eran UTC.
-- Tambien deja los valores por defecto de las columnas en UTC.
--
-- Es seguro ejecutarlo mas de una vez: la segunda vez no hace nada.
-- Ejecutar con las APIs detenidas.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

DO $$
DECLARE
  r record;
  ya_utc text[] := ARRAY[
    -- Estas columnas ya se guardaban en UTC: no se tocan.
    'trips.trips.passengerlocationat',
    'trips.sosalerts.resolvedat',
    'trips.favoritedrivers.createdat',
    'landing.contactmessages.readat',
    'landing.faqitems.updatedat',
    'drivers.driverpresencecheckins.checkedoutat'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM public.bugie_migraciones WHERE nombre = '2026-10-02_horas_a_utc') THEN
    RAISE NOTICE 'Ya aplicada antes: no se hace nada.';
    RETURN;
  END IF;

  FOR r IN
    SELECT table_schema AS s, table_name AS t, column_name AS c, column_default AS def
    FROM information_schema.columns
    WHERE table_schema IN ('auth', 'drivers', 'landing', 'payments', 'rewards', 'trips')
      AND data_type = 'timestamp without time zone'
    ORDER BY 1, 2, 3
  LOOP
    -- 1) datos: hora de Peru -> UTC
    IF NOT (r.s || '.' || r.t || '.' || r.c = ANY (ya_utc)) THEN
      EXECUTE format('UPDATE %I.%I SET %I = %I + interval ''5 hours'' WHERE %I IS NOT NULL',
                     r.s, r.t, r.c, r.c, r.c);
    END IF;

    -- 2) valor por defecto: now() -> UTC explicito
    IF r.def IS NOT NULL AND r.def ILIKE '%now()%' AND r.def NOT ILIKE '%utc%' THEN
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT (now() AT TIME ZONE ''utc'')',
                     r.s, r.t, r.c);
    END IF;
  END LOOP;

  INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-02_horas_a_utc');
  RAISE NOTICE 'Horas pasadas a UTC.';
END $$;
