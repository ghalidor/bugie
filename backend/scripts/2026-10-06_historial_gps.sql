-- =====================================================================
-- Historial GPS: particiones por dia + recorridos consolidados (2026-10-06)
--
-- drivers.locationhistory guarda el GPS crudo de los viajes. Con 1.000
-- viajes/dia son ~2 M de filas al mes, asi que en la base solo se quedan
-- los ultimos dias (GpsArchive:KeepDays, por defecto 2) y el resto se
-- archiva en Parquet (un archivo por dia) desde Drivers.Api.
--
-- 1. drivers.locationhistory pasa a ser una tabla PARTICIONADA POR RANGO
--    de recordedat, una particion por dia UTC (locationhistory_YYYYMMDD).
--    - Mismas columnas. PK (id, recordedat) porque la clave de particion
--      tiene que estar en la PK. id sigue siendo bigint autonumerico
--      (secuencia drivers.locationhistory_id_seq).
--    - Indice ix_locationhistory_trip_recorded (tripid, recordedat) en la
--      tabla padre (se hereda en cada particion). Los demas indices que
--      tuviera la tabla (p.ej. los de 2026-10-06_indices_rendimiento.sql)
--      se recrean sobre la tabla particionada.
--    - Particion DEFAULT (locationhistory_default) como red de seguridad:
--      si un dia no se creo su particion, el GPS no se pierde; al crearla
--      despues, las filas se mueven a la particion del dia.
--    - Los datos existentes se mueven creando las particiones necesarias.
--      Se verifica que el conteo antes y despues sea igual.
--
--    drivers.ensure_locationhistory_partition(dia)        -> crea la de un dia
--    drivers.ensure_locationhistory_partitions(dias)      -> hoy + N dias (UTC)
--
-- 2. drivers.trippaths: recorrido consolidado de un viaje (una fila por
--    viaje). Es lo que lee el detalle del viaje (admin, web, app) para
--    viajes pasados, sin tocar el GPS crudo.
--    - points: polilinea codificada (algoritmo de Google, precision 1e6,
--      funcion drivers.encode_polyline).
--    - details: jsonb {"t":[ms desde startedat], "s":[velocidades], "h":[rumbos]}.
--      (jsonb grande se comprime solo en TOAST).
--    drivers.consolidate_trip_path(tripid) arma/actualiza la fila desde
--    locationhistory y devuelve cuantos puntos tiene. La llama Drivers.Api
--    al completar el viaje y el job nocturno (GpsArchive).
--
-- 3. Se consolidan en esta misma corrida todos los viajes ya terminados
--    (completados o cancelados) que tengan GPS y aun no tengan recorrido.
--
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- -- Funciones de particiones ------------------------------------------

-- Crea la particion de un dia (UTC) si no existe. Si la particion DEFAULT
-- ya tiene filas de ese dia, las mueve a la particion nueva.
CREATE OR REPLACE FUNCTION drivers.ensure_locationhistory_partition(p_day date)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    v_name  text      := 'locationhistory_' || to_char(p_day, 'YYYYMMDD');
    v_from  timestamp := p_day::timestamp;
    v_to    timestamp := (p_day + 1)::timestamp;
    v_pend  bigint    := 0;
BEGIN
    IF to_regclass('drivers.' || v_name) IS NOT NULL THEN
        RETURN false;
    END IF;

    IF to_regclass('drivers.locationhistory_default') IS NOT NULL THEN
        SELECT count(*) INTO v_pend
          FROM drivers.locationhistory_default
         WHERE recordedat >= v_from AND recordedat < v_to;
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
            'ALTER TABLE drivers.%I ADD CONSTRAINT %I CHECK (recordedat >= %L AND recordedat < %L)',
            v_name, v_name || '_rango', v_from, v_to);
        EXECUTE format(
            'WITH m AS (DELETE FROM drivers.locationhistory_default WHERE recordedat >= %L AND recordedat < %L RETURNING *)
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

-- Crea las particiones de hoy (UTC) y de los proximos p_days_ahead dias.
-- Devuelve cuantas creo.
CREATE OR REPLACE FUNCTION drivers.ensure_locationhistory_partitions(p_days_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_today   date := (now() AT TIME ZONE 'utc')::date;
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

-- -- 1. Tabla particionada ---------------------------------------------

DO $$
DECLARE
    r               record;
    v_particionada  boolean;
    v_idx_defs      text[] := '{}';
    v_def           text;
    v_dia           date;
    v_antes         bigint;
    v_despues       bigint;
BEGIN
    SELECT EXISTS (
        SELECT 1
          FROM pg_partitioned_table pt
          JOIN pg_class c      ON c.oid = pt.partrelid
          JOIN pg_namespace n  ON n.oid = c.relnamespace
         WHERE n.nspname = 'drivers' AND c.relname = 'locationhistory')
      INTO v_particionada;

    IF v_particionada THEN
        RAISE NOTICE 'drivers.locationhistory ya esta particionada: no se toca.';
        RETURN;
    END IF;

    SELECT count(*) INTO v_antes FROM drivers.locationhistory;
    RAISE NOTICE 'Filas en drivers.locationhistory antes: %', v_antes;

    -- Indices actuales (sin la PK) para recrearlos en la tabla particionada.
    SELECT coalesce(array_agg(indexdef), '{}')
      INTO v_idx_defs
      FROM pg_indexes
     WHERE schemaname = 'drivers' AND tablename = 'locationhistory'
       AND indexname <> 'locationhistory_pkey';

    -- Se aparta la tabla vieja (y se liberan los nombres de sus indices).
    ALTER TABLE drivers.locationhistory RENAME TO locationhistory_old;
    FOR r IN SELECT indexname FROM pg_indexes
              WHERE schemaname = 'drivers' AND tablename = 'locationhistory_old'
    LOOP
        EXECUTE format('ALTER INDEX drivers.%I RENAME TO %I', r.indexname, r.indexname || '_old');
    END LOOP;

    -- La tabla vieja tenia id IDENTITY con una secuencia del mismo nombre
    -- (locationhistory_id_seq): se suelta para reutilizar el nombre.
    ALTER TABLE drivers.locationhistory_old ALTER COLUMN id DROP IDENTITY IF EXISTS;
    IF to_regclass('drivers.locationhistory_id_seq') IS NOT NULL THEN
        ALTER SEQUENCE drivers.locationhistory_id_seq RENAME TO locationhistory_id_seq_old;
    END IF;

    -- Tabla nueva particionada por dia.
    CREATE SEQUENCE drivers.locationhistory_id_seq AS bigint;
    CREATE TABLE drivers.locationhistory (
        id          bigint                      NOT NULL DEFAULT nextval('drivers.locationhistory_id_seq'),
        driverid    uuid                        NOT NULL,
        tripid      uuid                        NULL,
        lat         double precision            NOT NULL,
        lng         double precision            NOT NULL,
        speedkmh    double precision            NULL,
        heading     double precision            NULL,
        recordedat  timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
        CONSTRAINT locationhistory_pkey PRIMARY KEY (id, recordedat)
    ) PARTITION BY RANGE (recordedat);
    ALTER SEQUENCE drivers.locationhistory_id_seq OWNED BY drivers.locationhistory.id;

    -- Indice minimo para leer el recorrido de un viaje (se hereda por particion).
    -- Mismo nombre que en 2026-10-06_indices_rendimiento.sql para no duplicarlo.
    CREATE INDEX IF NOT EXISTS ix_locationhistory_trip_recorded ON drivers.locationhistory (tripid, recordedat);

    -- Red de seguridad: filas sin particion del dia caen aqui, no se pierden.
    CREATE TABLE drivers.locationhistory_default PARTITION OF drivers.locationhistory DEFAULT;

    -- Particiones de los dias con datos + hoy y 3 dias mas.
    FOR v_dia IN SELECT DISTINCT recordedat::date FROM drivers.locationhistory_old ORDER BY 1 LOOP
        PERFORM drivers.ensure_locationhistory_partition(v_dia);
    END LOOP;
    PERFORM drivers.ensure_locationhistory_partitions(3);

    -- Mover los datos conservando los id.
    INSERT INTO drivers.locationhistory (id, driverid, tripid, lat, lng, speedkmh, heading, recordedat)
    SELECT id, driverid, tripid, lat, lng, speedkmh, heading, recordedat
      FROM drivers.locationhistory_old;

    PERFORM setval('drivers.locationhistory_id_seq', coalesce(max(id), 0) + 1, false)
       FROM drivers.locationhistory;

    SELECT count(*) INTO v_despues FROM drivers.locationhistory;
    RAISE NOTICE 'Filas en drivers.locationhistory despues: %', v_despues;
    IF v_antes <> v_despues THEN
        RAISE EXCEPTION 'Conteo distinto al particionar locationhistory: antes % / despues %', v_antes, v_despues;
    END IF;

    DROP TABLE drivers.locationhistory_old;

    -- Recrear los indices que tenia la tabla (si alguno no aplica a una
    -- tabla particionada, p.ej. un UNIQUE sin recordedat, se avisa y sigue).
    FOREACH v_def IN ARRAY v_idx_defs LOOP
        v_def := replace(v_def, 'CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ');
        v_def := replace(v_def, 'CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ');
        BEGIN
            EXECUTE v_def;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'No se pudo recrear el indice (%): %', v_def, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'drivers.locationhistory particionada por dia (% filas).', v_despues;
END;
$$;

-- Bases donde este script corrio con el nombre anterior del indice: se unifica.
DO $$
BEGIN
    IF to_regclass('drivers.ix_locationhistory_trip_recordedat') IS NOT NULL THEN
        IF to_regclass('drivers.ix_locationhistory_trip_recorded') IS NULL THEN
            ALTER INDEX drivers.ix_locationhistory_trip_recordedat RENAME TO ix_locationhistory_trip_recorded;
        ELSE
            DROP INDEX drivers.ix_locationhistory_trip_recordedat;
        END IF;
    END IF;
END;
$$;

-- -- 2. Recorridos consolidados ----------------------------------------

CREATE TABLE IF NOT EXISTS drivers.trippaths (
    tripid          uuid                        NOT NULL PRIMARY KEY,
    driverid        uuid                        NOT NULL,
    pointcount      integer                     NOT NULL,
    distancekm      double precision            NOT NULL DEFAULT 0,
    startedat       timestamp without time zone NOT NULL,
    endedat         timestamp without time zone NOT NULL,
    points          text                        NOT NULL,   -- polilinea codificada (precision 1e6)
    details         jsonb                       NULL,       -- {"t":[ms desde startedat],"s":[km/h],"h":[rumbo]}
    consolidatedat  timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_trippaths_driver_startedat ON drivers.trippaths (driverid, startedat);

COMMENT ON TABLE  drivers.trippaths         IS 'Recorrido GPS consolidado por viaje. Se lee aqui el detalle de viajes pasados; el crudo (locationhistory) se archiva en Parquet.';
COMMENT ON COLUMN drivers.trippaths.points  IS 'Polilinea codificada (Google encoded polyline, factor 1e6). Ver drivers.encode_polyline.';
COMMENT ON COLUMN drivers.trippaths.details IS 'jsonb {"t":[ms desde startedat por punto], "s":[speedkmh], "h":[heading]} en el mismo orden que points.';

-- Un valor de la polilinea (algoritmo de Google).
CREATE OR REPLACE FUNCTION drivers.encode_polyline_value(p_value bigint)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_s   bigint := p_value << 1;
    v_out text   := '';
BEGIN
    IF p_value < 0 THEN v_s := ~v_s; END IF;
    WHILE v_s >= 32 LOOP
        v_out := v_out || chr((((v_s & 31) | 32) + 63)::int);
        v_s := v_s >> 5;
    END LOOP;
    RETURN v_out || chr((v_s + 63)::int);
END;
$$;

-- Polilinea codificada de una lista de puntos (lat[], lng[] en el mismo orden).
CREATE OR REPLACE FUNCTION drivers.encode_polyline(p_lat double precision[], p_lng double precision[], p_factor integer DEFAULT 1000000)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_parts   text[] := '{}';
    v_prevlat bigint := 0;
    v_prevlng bigint := 0;
    v_cur     bigint;
    i         integer;
BEGIN
    FOR i IN 1..coalesce(array_length(p_lat, 1), 0) LOOP
        v_cur := round(p_lat[i] * p_factor)::bigint;
        v_parts := v_parts || drivers.encode_polyline_value(v_cur - v_prevlat);
        v_prevlat := v_cur;
        v_cur := round(p_lng[i] * p_factor)::bigint;
        v_parts := v_parts || drivers.encode_polyline_value(v_cur - v_prevlng);
        v_prevlng := v_cur;
    END LOOP;
    RETURN array_to_string(v_parts, '');
END;
$$;

-- Arma (o rearma) el recorrido consolidado de un viaje desde locationhistory.
-- Devuelve la cantidad de puntos; 0 si el viaje no tiene GPS (no inserta nada).
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
    SELECT p_tripid, driverid, pointcount, distancekm, startedat, endedat, points, details, (now() AT TIME ZONE 'utc')
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

-- -- 3. Consolidar los viajes ya terminados que tengan GPS ------------

DO $$
DECLARE
    v_n integer := 0;
BEGIN
    IF to_regclass('trips.trips') IS NULL THEN
        RAISE NOTICE 'No existe trips.trips en esta base: no se consolidan viajes.';
        RETURN;
    END IF;

    SELECT count(*) INTO v_n
      FROM (
        SELECT drivers.consolidate_trip_path(t.id)
          FROM trips.trips t
         WHERE t.status IN (4, 5)   -- Completed, Cancelled
           AND EXISTS (SELECT 1 FROM drivers.locationhistory l WHERE l.tripid = t.id)
           AND NOT EXISTS (SELECT 1 FROM drivers.trippaths p WHERE p.tripid = t.id)
      ) x;

    RAISE NOTICE 'Viajes consolidados en drivers.trippaths: %', v_n;
END;
$$;

COMMIT;
