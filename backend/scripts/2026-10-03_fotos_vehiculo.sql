-- =====================================================================
-- Fotos del vehiculo 2026-10-03
-- Cada vehiculo tiene tres fotos: frente, costado y placa.
--   * drivers.vehiclephotos: una fila por (vehiculo, tipo). Al reemplazar
--     una foto se actualiza la fila (no se guarda historial).
--   * drivers.vehicles.photourl se mantiene = foto de frente (compatibilidad
--     con las pantallas que ya la usan).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS drivers.vehiclephotos (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicleid   uuid NOT NULL,
    phototype   character varying(10) NOT NULL,   -- front | side | plate
    url         character varying(500) NOT NULL,
    createdat   timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat   timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT vehiclephotos_pkey PRIMARY KEY (id),
    CONSTRAINT uq_vehiclephotos_vehicle_type UNIQUE (vehicleid, phototype),
    CONSTRAINT ck_vehiclephotos_type CHECK (phototype IN ('front', 'side', 'plate')),
    CONSTRAINT fk_vehiclephotos_vehicle FOREIGN KEY (vehicleid)
        REFERENCES drivers.vehicles (id) ON DELETE CASCADE
);

-- Los vehiculos que ya tenian foto: esa foto pasa a ser la de frente.
INSERT INTO drivers.vehiclephotos (vehicleid, phototype, url)
SELECT v.id, 'front', v.photourl
FROM drivers.vehicles v
WHERE v.photourl IS NOT NULL AND v.photourl <> ''
ON CONFLICT (vehicleid, phototype) DO NOTHING;

COMMIT;
