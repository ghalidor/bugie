-- =====================================================================
-- Fechas en UTC: revision y correccion (2026-10-06)
--
-- Regla del sistema (ver BugieTime en cada API):
--   * la base guarda TODAS las fechas en UTC (timestamp sin zona = UTC);
--   * las APIs abren la conexion con Timezone=UTC y escriben DateTime.UtcNow
--     o (now() AT TIME ZONE 'utc');
--   * la hora de Peru solo existe en la frontera: el JSON sale en hora de
--     Peru sin zona y lo que llega sin zona se toma como hora de Peru.
--
-- La migracion general ya se hizo en 2026-10-02_horas_a_utc.sql. Revision
-- del 2026-10-06 (codigo de las 6 APIs y bugie_test): ninguna columna se
-- sigue escribiendo en hora de Peru, asi que este script NO corre columnas
-- enteras. Solo:
--
--   1. Deja en UTC cualquier valor por defecto now() que haya quedado sin
--      zona (timestamp sin zona de los esquemas de Bugie).
--   2. Corrige viajes sueltos con createdat en hora de Peru y el resto en
--      UTC. Al crear un viaje, CreatedAt y PublishedAt son el mismo instante
--      (Trip.Create), asi que la marca es exacta: publishedat - createdat
--      = 5 h (+- 2 s). A esos viajes se les suma 5 h a createdat. Un viaje
--      reabierto tiene publishedat posterior, pero no a 5 h exactas.
--   3. Muestra un control: viajes completados con horas fuera de orden.
--
-- Es seguro ejecutarlo mas de una vez: queda registrado en
-- public.bugie_migraciones y la segunda vez no hace nada.
-- Ejecutar con las APIs detenidas.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

DO $$
DECLARE
  r          record;
  n_defaults int := 0;
  n_viajes   int := 0;
  n_mal      int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.bugie_migraciones WHERE nombre = '2026-10-06_fechas_utc') THEN
    RAISE NOTICE 'Ya aplicada antes: no se hace nada.';
    RETURN;
  END IF;

  -- 1) valores por defecto: now() -> UTC explicito
  FOR r IN
    SELECT table_schema AS s, table_name AS t, column_name AS c
    FROM information_schema.columns
    WHERE table_schema IN ('auth', 'drivers', 'landing', 'payments', 'rewards', 'trips')
      AND data_type = 'timestamp without time zone'
      AND column_default ILIKE '%now()%'
      AND column_default NOT ILIKE '%utc%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT (now() AT TIME ZONE ''utc'')',
                   r.s, r.t, r.c);
    n_defaults := n_defaults + 1;
  END LOOP;

  -- 2) viajes con createdat en hora de Peru (5 h antes que publishedat)
  UPDATE trips.trips
     SET createdat = createdat + interval '5 hours'
   WHERE publishedat IS NOT NULL
     AND abs(extract(epoch FROM publishedat - createdat) - 18000) <= 2;
  GET DIAGNOSTICS n_viajes = ROW_COUNT;

  -- 3) control: viajes completados con horas fuera de orden
  SELECT count(*) INTO n_mal
  FROM trips.trips
  WHERE status = 4
    AND (   createdat   > coalesce(publishedat, createdat) + interval '1 second'
         OR createdat   > acceptedat
         OR acceptedat  > startedat
         OR startedat   > completedat);

  INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-06_fechas_utc');
  RAISE NOTICE 'Defaults corregidos: %. Viajes con createdat corregido: %. Completados fuera de orden: %.',
               n_defaults, n_viajes, n_mal;
END $$;
