-- =====================================================================
-- Alertas de monitoreo 2026-10-07
-- Ademas del SOS y del desvio de ruta, Trips.Api revisa cada 30 s los
-- viajes activos (MonitorAlertsService) y abre alertas de:
--   * no_signal    : viaje en estado 2/3/6 cuyo conductor no envia GPS hace
--                    mas de monitor_no_signal_min minutos.
--   * long_stop    : viaje en curso (3) con el auto detenido (< 50 m) mas de
--                    monitor_long_stop_min minutos, lejos del destino (> 150 m).
--   * trip_delayed : viaje en curso (3) que lleva mas que la duracion estimada
--                    + monitor_trip_delay_pct % (y al menos 10 min mas).
--
-- 1. trips.monitoralerts: una fila por alerta. Abierta mientras resolvedat
--    sea NULL; se resuelve sola cuando la condicion termina o el viaje sale
--    de 2/3/6. El admin la marca revisada (reviewedat/reviewedby/reviewnote).
--    Indice unico parcial: una sola alerta abierta por (tripid, type).
--    details (jsonb): ultimo valor medido (minutes, estimatedMin, etc.).
--
-- 2. landing.systemsettings (Admin > Configuracion), solo si no existen:
--    monitor_no_signal_min = 3, monitor_long_stop_min = 5,
--    monitor_trip_delay_pct = 50.
--
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trips.monitoralerts (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid      uuid NOT NULL,
    driverid    uuid NOT NULL,             -- UserId del conductor
    type        character varying(20) NOT NULL,
    startedat   timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    lastseenat  timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    resolvedat  timestamp without time zone,
    reviewedat  timestamp without time zone,
    reviewedby  uuid,
    reviewnote  character varying(500),
    details     jsonb,
    CONSTRAINT monitoralerts_pkey PRIMARY KEY (id),
    CONSTRAINT ck_monitoralerts_type CHECK (type IN ('no_signal', 'long_stop', 'trip_delayed')),
    CONSTRAINT fk_monitoralerts_trip FOREIGN KEY (tripid)
        REFERENCES trips.trips (id) ON DELETE CASCADE
);

-- Listado del admin (abiertas / todas) y pasada del servicio.
CREATE INDEX IF NOT EXISTS ix_monitoralerts_resolved_type
    ON trips.monitoralerts (resolvedat, type);

-- Una sola alerta abierta por viaje y tipo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_monitoralerts_open_trip_type
    ON trips.monitoralerts (tripid, type) WHERE resolvedat IS NULL;

CREATE INDEX IF NOT EXISTS ix_monitoralerts_started
    ON trips.monitoralerts (startedat DESC);

-- -- Parametros (Admin > Configuracion) --------------------------------
INSERT INTO landing.systemsettings (settingkey, value, description) VALUES
  ('monitor_no_signal_min', '3',
   'Monitoreo: minutos sin recibir el GPS del conductor durante un viaje para abrir la alerta "Sin senal".'),
  ('monitor_long_stop_min', '5',
   'Monitoreo: minutos que el auto puede estar detenido en pleno viaje (lejos del destino) antes de abrir la alerta "Detenido".'),
  ('monitor_trip_delay_pct', '50',
   'Monitoreo: % sobre la duracion estimada para abrir la alerta "Viaje demorado" (ademas, al menos 10 min de retraso).')
ON CONFLICT (settingkey) DO NOTHING;

COMMIT;
