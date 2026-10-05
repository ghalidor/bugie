-- =====================================================================
-- Desvio de ruta 2026-10-03
-- La deteccion de desvio pasa al backend (Trips.Api):
--   * trips.tripplannedroutes: ruta planificada de cada viaje, por tramo
--     ('pickup' = conductor -> recojo, 'trip' = recojo -> paradas -> destino).
--     Se calcula con GraphHopper; si no responde, linea recta (source='straight').
--   * trips.routedeviations: alertas de desvio (abierta mientras el conductor
--     siga fuera de la ruta; el admin la marca como revisada con una nota).
--   * Settings en landing.systemsettings: deviation_detection_enabled y
--     deviation_threshold_m (solo se insertan si no existen).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trips.tripplannedroutes (
    id              uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid          uuid NOT NULL,
    leg             character varying(10) NOT NULL,
    source          character varying(15) NOT NULL,
    -- Puntos de la ruta como JSON: [[lat,lng],[lat,lng],...]
    points          jsonb NOT NULL,
    distancemeters  double precision,
    -- Lecturas GPS seguidas fuera de la ruta (para evitar falsos positivos).
    offroutestreak  integer DEFAULT 0 NOT NULL,
    createdat       timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT tripplannedroutes_pkey PRIMARY KEY (id),
    CONSTRAINT uq_tripplannedroutes_trip_leg UNIQUE (tripid, leg),
    CONSTRAINT ck_tripplannedroutes_leg CHECK (leg IN ('pickup', 'trip')),
    CONSTRAINT ck_tripplannedroutes_source CHECK (source IN ('graphhopper', 'straight')),
    CONSTRAINT fk_tripplannedroutes_trip FOREIGN KEY (tripid)
        REFERENCES trips.trips (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trips.routedeviations (
    id             uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid         uuid NOT NULL,
    driverid       uuid NOT NULL,             -- UserId del conductor
    leg            character varying(10) DEFAULT 'trip' NOT NULL,
    lat            double precision NOT NULL, -- donde se detecto
    lng            double precision NOT NULL,
    distancem      double precision NOT NULL, -- distancia a la ruta al detectar
    maxdistancem   double precision NOT NULL, -- maxima distancia mientras estuvo desviado
    status         character varying(10) DEFAULT 'open' NOT NULL,
    closereason    character varying(20),     -- back_on_route | trip_ended
    startedat      timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    endedat        timestamp without time zone,
    reviewedby     uuid,
    reviewedat     timestamp without time zone,
    reviewnote     character varying(500),
    CONSTRAINT routedeviations_pkey PRIMARY KEY (id),
    CONSTRAINT ck_routedeviations_status CHECK (status IN ('open', 'closed')),
    CONSTRAINT ck_routedeviations_leg CHECK (leg IN ('pickup', 'trip')),
    CONSTRAINT fk_routedeviations_trip FOREIGN KEY (tripid)
        REFERENCES trips.trips (id) ON DELETE CASCADE
);

-- Una sola alerta abierta por viaje (no se repiten mientras siga desviado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_routedeviations_open_trip
    ON trips.routedeviations (tripid) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_routedeviations_open_driver
    ON trips.routedeviations (driverid) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_routedeviations_trip
    ON trips.routedeviations (tripid, startedat DESC);
CREATE INDEX IF NOT EXISTS idx_routedeviations_unreviewed
    ON trips.routedeviations (startedat DESC) WHERE reviewedat IS NULL;

-- Settings por defecto (si ya existen, no se tocan).
INSERT INTO landing.systemsettings (settingkey, value, description)
VALUES ('deviation_detection_enabled', 'true',
        'Si esta en true, el sistema detecta cuando el conductor se sale de la ruta del viaje y alerta al monitoreo.')
ON CONFLICT (settingkey) DO NOTHING;

INSERT INTO landing.systemsettings (settingkey, value, description)
VALUES ('deviation_threshold_m', '300',
        'Distancia en metros a la ruta planificada a partir de la cual se considera desvio (por defecto 300).')
ON CONFLICT (settingkey) DO NOTHING;

COMMIT;
