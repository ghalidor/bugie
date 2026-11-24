-- =====================================================================
-- Fechas con zona horaria: timestamp -> timestamptz (2026-10-08)
--
-- Objetivo: que quien consulte la base directamente (auditor, psql,
-- pgAdmin) vea la hora exacta de Peru de cada registro, p. ej.
-- "2026-10-08 05:00:00-05", sin sumar ni restar horas.
--
-- Punto de partida: desde 2026-10-02 (2026-10-02_horas_a_utc.sql y
-- 2026-10-06_fechas_utc.sql) TODAS las columnas timestamp sin zona de los
-- esquemas de Bugie guardan UTC. Este script:
--
--   1. Convierte cada columna "timestamp without time zone" de los esquemas
--      auth, trips, drivers, payments, landing, rewards y public a
--      timestamptz con USING col AT TIME ZONE 'UTC' (mismo instante, no se
--      altera ningun dato). Una sola ALTER TABLE por tabla (una reescritura).
--      Los indices (incluidos los parciales) y los CHECK sobre esas columnas
--      los reconstruye PostgreSQL solo en la misma ALTER TABLE. No hay
--      vistas, triggers, columnas generadas ni indices de expresion sobre
--      estas columnas (revisado 2026-10-08); si en otra base los hubiera,
--      la ALTER falla y no se aplica nada (todo va en una transaccion).
--   2. Valores por defecto: (now() AT TIME ZONE 'utc'), timezone('utc',now())
--      y similares -> now(). Si aparece un default que no es "ahora en UTC"
--      el script se detiene (no se convierte nada a ciegas).
--   3. drivers.locationhistory (particionada por recordedat): la clave de
--      particion no admite ALTER TYPE, asi que se recrea la tabla padre con
--      recordedat timestamptz y se mueven los datos. Formato nuevo de las
--      particiones (para el job GpsArchive de Drivers.Api):
--        * nombre igual que antes: drivers.locationhistory_YYYYMMDD
--          (YYYYMMDD = dia UTC), mas drivers.locationhistory_default;
--        * limites UTC explicitos:
--            FOR VALUES FROM ('YYYY-MM-DD 00:00:00+00') TO ('YYYY-MM-DD+1 00:00:00+00')
--          (al listarlas en una sesion America/Lima se ven como
--           'YYYY-MM-DD-1 19:00:00-05'; es el mismo instante);
--        * se siguen creando con drivers.ensure_locationhistory_partition(dia)
--          / drivers.ensure_locationhistory_partitions(dias), que este script
--          deja adaptadas a timestamptz (limites UTC independientes de la
--          zona de la sesion).
--      Tambien drivers.consolidate_trip_path escribe consolidatedat = now().
--   4. ALTER DATABASE <base actual> SET timezone TO 'America/Lima'
--      (aplica a las sesiones NUEVAS; las APIs que abren con Timezone=UTC
--      siguen viendo UTC, los instantes son los mismos).
--   5. Verifica: 0 columnas timestamp sin zona en esos esquemas, mismos
--      conteos de filas antes/despues y particiones de locationhistory con
--      limites a medianoche UTC. Si algo no cuadra, ROLLBACK de todo.
--   6. Corrige landing.faqitems.updatedat sembrado en hora de Peru
--      (updatedat = createdat - 5 h -> + 5 h).
--
-- Requisito: 2026-10-06_fechas_utc.sql aplicado (datos en UTC).
-- Idempotente: si las columnas ya son timestamptz no hace nada (solo vuelve
-- a dejar las funciones y el timezone de la base, que no cambian nada).
--
-- Bloqueos: toma ACCESS EXCLUSIVE sobre todas las tablas convertidas hasta
-- el COMMIT (reescritura de cada tabla). Ejecutar con las APIs detenidas.
-- =====================================================================

BEGIN;

-- La sesion del script en UTC: cualquier conversion implicita o texto
-- mostrado durante la migracion se interpreta en UTC.
SET LOCAL timezone = 'UTC';
-- Si alguna API sigue conectada y tiene una tabla tomada, fallar rapido en
-- vez de quedar esperando (y bloquear a todos detras).
SET LOCAL lock_timeout = '15s';

-- -- 0. Conteos antes ---------------------------------------------------

CREATE TEMP TABLE _tz_conteo_antes ON COMMIT DROP AS
SELECT n.nspname AS s, c.relname AS t,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS filas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('auth', 'trips', 'drivers', 'payments', 'landing', 'rewards', 'public')
   AND c.relkind IN ('r', 'p')
   AND NOT c.relispartition;

-- -- 1. Requisito: datos ya en UTC ------------------------------------

DO $$
DECLARE
    v_pendientes int;
BEGIN
    SELECT count(*) INTO v_pendientes
      FROM information_schema.columns
     WHERE table_schema IN ('auth', 'trips', 'drivers', 'payments', 'landing', 'rewards', 'public')
       AND data_type = 'timestamp without time zone';

    IF v_pendientes > 0
       AND (to_regclass('public.bugie_migraciones') IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.bugie_migraciones WHERE nombre = '2026-10-06_fechas_utc')) THEN
        RAISE EXCEPTION 'Falta aplicar 2026-10-06_fechas_utc.sql: no se puede asegurar que las fechas esten en UTC.';
    END IF;

    IF to_regclass('drivers.locationhistory_old') IS NOT NULL THEN
        RAISE EXCEPTION 'Existe drivers.locationhistory_old (resto de una corrida anterior): revisar a mano antes de seguir.';
    END IF;
END;
$$;

-- -- 2. drivers.locationhistory: recrear con recordedat timestamptz ----

DO $$
DECLARE
    r            record;
    v_tipo       text;
    v_cols       text;
    v_idx_defs   text[] := '{}';
    v_def        text;
    v_dias       date[] := '{}';
    v_dia        date;
    v_antes      bigint;
    v_despues    bigint;
    v_firma_a    text;
    v_firma_d    text;
    v_parts_a    text;
    v_parts_d    text;
BEGIN
    IF to_regclass('drivers.locationhistory') IS NULL THEN
        RAISE NOTICE 'No existe drivers.locationhistory: se omite.';
        RETURN;
    END IF;

    SELECT data_type INTO v_tipo
      FROM information_schema.columns
     WHERE table_schema = 'drivers' AND table_name = 'locationhistory' AND column_name = 'recordedat';

    IF v_tipo = 'timestamp with time zone' THEN
        RAISE NOTICE 'drivers.locationhistory ya tiene recordedat timestamptz: no se toca.';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'drivers.locationhistory'::regclass) THEN
        RAISE EXCEPTION 'drivers.locationhistory no esta particionada: aplicar antes 2026-10-06_historial_gps.sql.';
    END IF;

    -- Las columnas deben ser las conocidas (si no, la recreacion perderia algo).
    SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_cols
      FROM pg_attribute
     WHERE attrelid = 'drivers.locationhistory'::regclass AND attnum > 0 AND NOT attisdropped;
    IF v_cols <> 'id,driverid,tripid,lat,lng,speedkmh,heading,recordedat' THEN
        RAISE EXCEPTION 'Columnas inesperadas en drivers.locationhistory: %', v_cols;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute
                WHERE attrelid = 'drivers.locationhistory'::regclass AND attname = 'id' AND attidentity <> '') THEN
        RAISE EXCEPTION 'drivers.locationhistory.id es IDENTITY: caso no previsto por este script.';
    END IF;

    -- Particiones diarias actuales: nombre locationhistory_YYYYMMDD y rango
    -- [YYYY-MM-DD 00:00, +1 dia) en UTC. Cualquier otra cosa detiene el script.
    FOR r IN
        SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) AS bound
          FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'drivers.locationhistory'::regclass
         ORDER BY c.relname
    LOOP
        IF r.relname = 'locationhistory_default' THEN
            CONTINUE;
        END IF;
        IF r.relname !~ '^locationhistory_\d{8}$' THEN
            RAISE EXCEPTION 'Particion con nombre inesperado: drivers.%', r.relname;
        END IF;
        v_dia := to_date(substr(r.relname, 17, 8), 'YYYYMMDD');
        IF r.bound <> format('FOR VALUES FROM (%L) TO (%L)', v_dia::timestamp::text, (v_dia + 1)::timestamp::text) THEN
            RAISE EXCEPTION 'Particion drivers.% con limites inesperados: %', r.relname, r.bound;
        END IF;
        v_dias := v_dias || v_dia;
    END LOOP;

    -- Firma de los datos antes (conteo, suma de id, suma de epoch tomando el
    -- valor viejo como UTC) y filas por particion.
    SELECT count(*), count(*) || '/' || coalesce(sum(id), 0) || '/' || coalesce(sum(extract(epoch FROM recordedat)), 0)
      INTO v_antes, v_firma_a
      FROM drivers.locationhistory;
    SELECT string_agg(relname || '=' || n, ',' ORDER BY relname) INTO v_parts_a
      FROM (SELECT c.relname,
                   (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM drivers.%I', c.relname), false, true, '')))[1]::text AS n
              FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
             WHERE i.inhparent = 'drivers.locationhistory'::regclass) x;
    RAISE NOTICE 'locationhistory antes: % filas (%)', v_antes, v_parts_a;

    -- Indices de la tabla padre (sin la PK) para recrearlos igual.
    SELECT coalesce(array_agg(replace(indexdef, ' ON ONLY ', ' ON ') ORDER BY indexname), '{}')
      INTO v_idx_defs
      FROM pg_indexes
     WHERE schemaname = 'drivers' AND tablename = 'locationhistory'
       AND indexname <> 'locationhistory_pkey';

    -- Apartar la tabla vieja: padre, particiones y todos sus indices con
    -- sufijo _old, para liberar los nombres.
    FOR r IN
        SELECT ic.relname AS idx
          FROM pg_index x JOIN pg_class ic ON ic.oid = x.indexrelid
         WHERE x.indrelid = 'drivers.locationhistory'::regclass
            OR x.indrelid IN (SELECT inhrelid FROM pg_inherits WHERE inhparent = 'drivers.locationhistory'::regclass)
    LOOP
        EXECUTE format('ALTER INDEX drivers.%I RENAME TO %I', r.idx, r.idx || '_old');
    END LOOP;
    FOR r IN
        SELECT c.relname
          FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'drivers.locationhistory'::regclass
    LOOP
        EXECUTE format('ALTER TABLE drivers.%I RENAME TO %I', r.relname, r.relname || '_old');
    END LOOP;
    ALTER TABLE drivers.locationhistory RENAME TO locationhistory_old;

    -- La secuencia de id se conserva (mismos id, sin reiniciar): se suelta
    -- de la tabla vieja para que no se borre con ella.
    ALTER SEQUENCE drivers.locationhistory_id_seq OWNED BY NONE;

    -- Tabla nueva: mismas columnas, recordedat timestamptz.
    CREATE TABLE drivers.locationhistory (
        id          bigint                   NOT NULL DEFAULT nextval('drivers.locationhistory_id_seq'),
        driverid    uuid                     NOT NULL,
        tripid      uuid                     NULL,
        lat         double precision         NOT NULL,
        lng         double precision         NOT NULL,
        speedkmh    double precision         NULL,
        heading     double precision         NULL,
        recordedat  timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT locationhistory_pkey PRIMARY KEY (id, recordedat)
    ) PARTITION BY RANGE (recordedat);
    ALTER SEQUENCE drivers.locationhistory_id_seq OWNED BY drivers.locationhistory.id;

    FOREACH v_def IN ARRAY v_idx_defs LOOP
        EXECUTE v_def;
    END LOOP;
    -- Indice minimo de lectura por viaje (por si la base no lo tenia).
    IF to_regclass('drivers.ix_locationhistory_trip_recorded') IS NULL THEN
        CREATE INDEX ix_locationhistory_trip_recorded ON drivers.locationhistory (tripid, recordedat);
    END IF;

    -- Particiones equivalentes: mismo nombre, limites UTC explicitos.
    FOREACH v_dia IN ARRAY v_dias LOOP
        EXECUTE format(
            'CREATE TABLE drivers.%I PARTITION OF drivers.locationhistory FOR VALUES FROM (%L) TO (%L)',
            'locationhistory_' || to_char(v_dia, 'YYYYMMDD'),
            to_char(v_dia, 'YYYY-MM-DD') || ' 00:00:00+00',
            to_char(v_dia + 1, 'YYYY-MM-DD') || ' 00:00:00+00');
    END LOOP;
    CREATE TABLE drivers.locationhistory_default PARTITION OF drivers.locationhistory DEFAULT;

    -- Mover los datos (mismo instante: el valor viejo era UTC).
    INSERT INTO drivers.locationhistory (id, driverid, tripid, lat, lng, speedkmh, heading, recordedat)
    SELECT id, driverid, tripid, lat, lng, speedkmh, heading, recordedat AT TIME ZONE 'UTC'
      FROM drivers.locationhistory_old;

    -- Verificar antes de borrar la vieja.
    SELECT count(*), count(*) || '/' || coalesce(sum(id), 0) || '/' || coalesce(sum(extract(epoch FROM recordedat)), 0)
      INTO v_despues, v_firma_d
      FROM drivers.locationhistory;
    SELECT string_agg(relname || '=' || n, ',' ORDER BY relname) INTO v_parts_d
      FROM (SELECT c.relname,
                   (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM drivers.%I', c.relname), false, true, '')))[1]::text AS n
              FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
             WHERE i.inhparent = 'drivers.locationhistory'::regclass) x;
    RAISE NOTICE 'locationhistory despues: % filas (%)', v_despues, v_parts_d;

    IF v_firma_a <> v_firma_d OR coalesce(v_parts_a, '') <> coalesce(v_parts_d, '') THEN
        RAISE EXCEPTION 'locationhistory no cuadra. Antes: % [%]. Despues: % [%]',
                        v_firma_a, v_parts_a, v_firma_d, v_parts_d;
    END IF;

    DROP TABLE drivers.locationhistory_old;   -- arrastra sus particiones _old
    RAISE NOTICE 'drivers.locationhistory recreada con recordedat timestamptz (% particiones diarias + default).',
                 coalesce(array_length(v_dias, 1), 0);
END;
$$;

-- -- 3. Resto de columnas: timestamp -> timestamptz ------------------

DO $$
DECLARE
    r          record;
    c          record;
    v_def      text;
    v_func     text;
    v_cmds     text[];
    v_tablas   int := 0;
    v_columnas int := 0;
BEGIN
    FOR r IN
        SELECT col.table_schema AS s, col.table_name AS t
          FROM information_schema.columns col
          JOIN pg_namespace n ON n.nspname = col.table_schema
          JOIN pg_class k     ON k.relnamespace = n.oid AND k.relname = col.table_name
         WHERE col.table_schema IN ('auth', 'trips', 'drivers', 'payments', 'landing', 'rewards', 'public')
           AND col.data_type = 'timestamp without time zone'
           AND k.relkind IN ('r', 'p')
           AND NOT k.relispartition                     -- las particiones heredan el cambio del padre
           AND NOT (col.table_schema = 'drivers' AND col.table_name = 'locationhistory')
         GROUP BY 1, 2
         ORDER BY 1, 2
    LOOP
        v_cmds := '{}';
        FOR c IN
            SELECT column_name AS col, column_default AS def
              FROM information_schema.columns
             WHERE table_schema = r.s AND table_name = r.t
               AND data_type = 'timestamp without time zone'
             ORDER BY ordinal_position
        LOOP
            v_func := NULL;
            IF c.def IS NOT NULL THEN
                -- Solo se acepta "ahora en UTC": (now() AT TIME ZONE 'utc'),
                -- timezone('utc', now()), CURRENT_TIMESTAMP AT TIME ZONE 'UTC'...
                v_def := lower(regexp_replace(c.def, '\s+', '', 'g'));
                IF v_def ~ '^\(*(now\(\)|current_timestamp|transaction_timestamp\(\)|statement_timestamp\(\)|clock_timestamp\(\))attimezone''utc''(::text)?\)*$'
                   OR v_def ~ '^timezone\(''utc''(::text)?,(now\(\)|current_timestamp|transaction_timestamp\(\)|statement_timestamp\(\)|clock_timestamp\(\))\)$' THEN
                    v_func := CASE WHEN v_def LIKE '%clock_timestamp%' THEN 'clock_timestamp()' ELSE 'now()' END;
                ELSE
                    RAISE EXCEPTION 'Default no previsto en %.%.%: %  (revisar a mano; no se convierte nada)',
                                    r.s, r.t, c.col, c.def;
                END IF;
                v_cmds := v_cmds || format('ALTER COLUMN %I DROP DEFAULT', c.col);
            END IF;

            v_cmds := v_cmds || format('ALTER COLUMN %I TYPE timestamp with time zone USING %I AT TIME ZONE ''UTC''',
                                       c.col, c.col);
            IF v_func IS NOT NULL THEN
                v_cmds := v_cmds || format('ALTER COLUMN %I SET DEFAULT %s', c.col, v_func);
            END IF;
            v_columnas := v_columnas + 1;
        END LOOP;

        -- Una sola ALTER TABLE por tabla: una sola reescritura.
        EXECUTE format('ALTER TABLE %I.%I ', r.s, r.t) || array_to_string(v_cmds, ', ');
        v_tablas := v_tablas + 1;
    END LOOP;

    RAISE NOTICE 'Columnas convertidas a timestamptz: % (en % tablas).', v_columnas, v_tablas;
END;
$$;

-- -- 4. Defaults "UTC" que hayan quedado en columnas ya timestamptz ---

DO $$
DECLARE
    r     record;
    v_def text;
    v_n   int := 0;
BEGIN
    FOR r IN
        SELECT table_schema AS s, table_name AS t, column_name AS col, column_default AS def
          FROM information_schema.columns
         WHERE table_schema IN ('auth', 'trips', 'drivers', 'payments', 'landing', 'rewards', 'public')
           AND data_type = 'timestamp with time zone'
           AND column_default ILIKE '%utc%'
    LOOP
        v_def := lower(regexp_replace(r.def, '\s+', '', 'g'));
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s', r.s, r.t, r.col,
                       CASE WHEN v_def LIKE '%clock_timestamp%' THEN 'clock_timestamp()' ELSE 'now()' END);
        v_n := v_n + 1;
    END LOOP;
    IF v_n > 0 THEN
        RAISE NOTICE 'Defaults UTC corregidos en columnas timestamptz: %', v_n;
    END IF;
END;
$$;

-- -- 5. Funciones de drivers adaptadas a timestamptz -----------------

-- Crea la particion de un dia UTC si no existe. Limites UTC explicitos
-- ('YYYY-MM-DD 00:00:00+00'), asi no dependen de la zona de la sesion.
-- Si la particion DEFAULT ya tiene filas de ese dia, las mueve.
CREATE OR REPLACE FUNCTION drivers.ensure_locationhistory_partition(p_day date)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    v_name  text        := 'locationhistory_' || to_char(p_day, 'YYYYMMDD');
    v_from  text        := to_char(p_day, 'YYYY-MM-DD') || ' 00:00:00+00';
    v_to    text        := to_char(p_day + 1, 'YYYY-MM-DD') || ' 00:00:00+00';
    v_pend  bigint      := 0;
BEGIN
    IF to_regclass('drivers.' || v_name) IS NOT NULL THEN
        RETURN false;
    END IF;

    IF to_regclass('drivers.locationhistory_default') IS NOT NULL THEN
        SELECT count(*) INTO v_pend
          FROM drivers.locationhistory_default
         WHERE recordedat >= v_from::timestamptz AND recordedat < v_to::timestamptz;
    END IF;

    IF v_pend = 0 THEN
        EXECUTE format(
            'CREATE TABLE drivers.%I PARTITION OF drivers.locationhistory FOR VALUES FROM (%L) TO (%L)',
            v_name, v_from, v_to);
    ELSE
        -- Hay filas del dia en la particion DEFAULT: se crea la tabla suelta,
        -- se mueven las filas y recien se adjunta como particion.
        EXECUTE format(
            'CREATE TABLE drivers.%I (LIKE drivers.locationhistory INCLUDING DEFAULTS INCLUDING CONSTRAINTS)',
            v_name);
        EXECUTE format(
            'ALTER TABLE drivers.%I ADD CONSTRAINT %I CHECK (recordedat >= %L::timestamptz AND recordedat < %L::timestamptz)',
            v_name, v_name || '_rango', v_from, v_to);
        EXECUTE format(
            'WITH m AS (DELETE FROM drivers.locationhistory_default WHERE recordedat >= %L::timestamptz AND recordedat < %L::timestamptz RETURNING *)
             INSERT INTO drivers.%I SELECT * FROM m',
            v_from, v_to, v_name);
        EXECUTE format(
            'ALTER TABLE drivers.locationhistory ATTACH PARTITION drivers.%I FOR VALUES FROM (%L) TO (%L)',
            v_name, v_from, v_to);
        EXECUTE format('ALTER TABLE drivers.%I DROP CONSTRAINT %I', v_name, v_name || '_rango');
    END IF;

    RETURN true;
END;
$$;

-- Crea las particiones de hoy (dia UTC) y de los proximos p_days_ahead dias.
CREATE OR REPLACE FUNCTION drivers.ensure_locationhistory_partitions(p_days_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_today   date := (now() AT TIME ZONE 'UTC')::date;
    v_created integer := 0;
    i         integer;
BEGIN
    FOR i IN 0..greatest(p_days_ahead, 0) LOOP
        IF drivers.ensure_locationhistory_partition(v_today + i) THEN
            v_created := v_created + 1;
        END IF;
    END LOOP;
    RETURN v_created;
END;
$$;

-- Arma (o rearma) el recorrido consolidado de un viaje desde locationhistory.
-- Igual que en 2026-10-06_historial_gps.sql, salvo consolidatedat = now().
CREATE OR REPLACE FUNCTION drivers.consolidate_trip_path(p_tripid uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    WITH pts AS (
        SELECT id, driverid, lat, lng, speedkmh, heading, recordedat,
               lag(lat) OVER w AS plat,
               lag(lng) OVER w AS plng,
               min(recordedat) OVER () AS startedat
          FROM drivers.locationhistory
         WHERE tripid = p_tripid
        WINDOW w AS (ORDER BY recordedat, id)
    ), agg AS (
        SELECT count(*)::int                                            AS pointcount,
               (array_agg(driverid ORDER BY recordedat, id))[1]        AS driverid,
               min(recordedat)                                         AS startedat,
               max(recordedat)                                         AS endedat,
               coalesce(sum(CASE WHEN plat IS NULL THEN 0 ELSE
                   2 * 6371 * asin(sqrt(least(1,
                       power(sin(radians(lat - plat) / 2), 2)
                       + cos(radians(plat)) * cos(radians(lat)) * power(sin(radians(lng - plng) / 2), 2))))
                   END), 0)                                            AS distancekm,
               drivers.encode_polyline(
                   array_agg(lat ORDER BY recordedat, id),
                   array_agg(lng ORDER BY recordedat, id))             AS points,
               jsonb_build_object(
                   't', jsonb_agg(round(extract(epoch FROM (recordedat - startedat)) * 1000)::bigint ORDER BY recordedat, id),
                   's', jsonb_agg(speedkmh ORDER BY recordedat, id),
                   'h', jsonb_agg(heading  ORDER BY recordedat, id))   AS details
          FROM pts
    )
    INSERT INTO drivers.trippaths (tripid, driverid, pointcount, distancekm, startedat, endedat, points, details, consolidatedat)
    SELECT p_tripid, driverid, pointcount, distancekm, startedat, endedat, points, details, now()
      FROM agg
     WHERE pointcount > 0
    ON CONFLICT (tripid) DO UPDATE
       SET driverid       = EXCLUDED.driverid,
           pointcount     = EXCLUDED.pointcount,
           distancekm     = EXCLUDED.distancekm,
           startedat      = EXCLUDED.startedat,
           endedat        = EXCLUDED.endedat,
           points         = EXCLUDED.points,
           details        = EXCLUDED.details,
           consolidatedat = EXCLUDED.consolidatedat
    RETURNING pointcount INTO v_count;

    RETURN coalesce(v_count, 0);
END;
$$;

-- -- 6. Zona horaria de la base: hora de Peru -------------------------

DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Lima');
END;
$$;

-- -- 7. Verificaciones (si algo falla, ROLLBACK de todo) -------------

DO $$
DECLARE
    v_n    int;
    v_dif  text;
    v_mal  text;
BEGIN
    -- 7.1 ninguna columna timestamp sin zona en los esquemas de Bugie
    SELECT count(*), string_agg(table_schema || '.' || table_name || '.' || column_name, ', ')
      INTO v_n, v_dif
      FROM information_schema.columns
     WHERE table_schema IN ('auth', 'trips', 'drivers', 'payments', 'landing', 'rewards', 'public')
       AND data_type = 'timestamp without time zone';
    IF v_n > 0 THEN
        RAISE EXCEPTION 'Quedan % columnas timestamp sin zona: %', v_n, v_dif;
    END IF;

    -- 7.2 mismos conteos de filas por tabla
    SELECT string_agg(a.s || '.' || a.t || ' ' || a.filas || '->' || coalesce(d.filas::text, 'NULL'), ', ')
      INTO v_dif
      FROM _tz_conteo_antes a
      LEFT JOIN LATERAL (
          SELECT (xpath('/row/c/text()',
                        query_to_xml(format('SELECT count(*) AS c FROM %I.%I', a.s, a.t), false, true, '')))[1]::text::bigint AS filas
      ) d ON true
     WHERE d.filas IS DISTINCT FROM a.filas;
    IF v_dif IS NOT NULL THEN
        RAISE EXCEPTION 'Conteos distintos: %', v_dif;
    END IF;

    -- 7.3 ningun default "UTC" restante
    SELECT string_agg(table_schema || '.' || table_name || '.' || column_name || '=' || column_default, ', ')
      INTO v_dif
      FROM information_schema.columns
     WHERE table_schema IN ('auth', 'trips', 'drivers', 'payments', 'landing', 'rewards', 'public')
       AND column_default ILIKE '%time zone%';
    IF v_dif IS NOT NULL THEN
        RAISE EXCEPTION 'Quedan defaults con AT TIME ZONE: %', v_dif;
    END IF;

    -- 7.4 particiones de locationhistory: locationhistory_YYYYMMDD con
    --     limites a medianoche UTC de ese dia
    IF to_regclass('drivers.locationhistory') IS NOT NULL THEN
        SELECT string_agg(c.relname, ', ')
          INTO v_mal
          FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'drivers.locationhistory'::regclass
           AND c.relname <> 'locationhistory_default'
           AND (c.relname !~ '^locationhistory_\d{8}$'
                OR pg_get_expr(c.relpartbound, c.oid) <> format('FOR VALUES FROM (%L) TO (%L)',
                       (to_date(substr(c.relname, 17, 8), 'YYYYMMDD')::timestamp AT TIME ZONE 'UTC')::text,
                       ((to_date(substr(c.relname, 17, 8), 'YYYYMMDD') + 1)::timestamp AT TIME ZONE 'UTC')::text));
        IF v_mal IS NOT NULL THEN
            RAISE EXCEPTION 'Particiones de locationhistory con limites no UTC: %', v_mal;
        END IF;
        IF to_regclass('drivers.locationhistory_default') IS NULL THEN
            RAISE EXCEPTION 'Falta drivers.locationhistory_default.';
        END IF;
    END IF;

    RAISE NOTICE 'Verificacion OK: 0 columnas timestamp sin zona, conteos iguales, defaults y particiones correctos.';
END;
$$;

-- -- 8. Dato mal guardado: landing.faqitems.updatedat ----------------
-- Las FAQ sembradas tenian updatedat en hora de Peru (no UTC), por eso
-- 2026-10-02_horas_a_utc.sql no lo movio: quedaron 5 h antes que createdat.
-- Se corrige solo ese caso (updatedat = createdat - 5 h). Idempotente: una
-- vez corregido ya no cumple la condicion. El codigo de Landing escribe UTC.

UPDATE landing.faqitems
   SET updatedat = updatedat + interval '5 hours'
 WHERE updatedat = createdat - interval '5 hours';

-- -- 9. Ajuste de Rewards que ya no se usa ---------------------------
-- Rewards calcula los dias de Peru con la zona fija America/Lima (BugieTime);
-- timezone_offset_hours deja de leerse. La fila se conserva (no se borra
-- nada), solo se aclara su descripcion. Idempotente.

UPDATE rewards.settings
   SET description = '(ya no se usa: la zona es America/Lima)'
 WHERE settingkey = 'timezone_offset_hours'
   AND description IS DISTINCT FROM '(ya no se usa: la zona es America/Lima)';

INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-08_fechas_timestamptz')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
