-- ============================================================================
-- Migracion: 003_Delivery_postgres.sql   (PostgreSQL)
-- Agrega soporte de ENVIOS (Delivery) al modulo Trips:
--   * Columnas de tipo de servicio y datos del paquete en trips.Trips
--   * Columnas de verificacion del paquete al recoger (pickup)
--   * Tabla trips.TripPhotos (fotos del paquete y de la verificacion)
--
-- NOTA: el motor real de la app es PostgreSQL (la conexion usa NpgsqlConnection).
-- Las migraciones 001/002 estan en sintaxis SQL Server; esta es Postgres para
-- que corra contra la base real. Aplicar con: psql ... -f 003_Delivery_postgres.sql
-- ============================================================================

-- 1) Tipo de servicio + datos del paquete + verificacion de pickup
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS ServiceType        SMALLINT      NOT NULL DEFAULT 0; -- 0=Ride 1=Delivery
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS PackageDescription TEXT          NULL;
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS PackageWeightKg    NUMERIC(10,2) NULL;
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS PackageIsFragile   BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS PackageDetails     TEXT          NULL;
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS PickupVerified     BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE trips.Trips ADD COLUMN IF NOT EXISTS PickupObservation  TEXT          NULL;

-- 2) Fotos del envio (paquete del cliente + verificacion del conductor)
--    Kind: 0=RequestPackage (cliente)  1=PickupMain (conductor)  2=PickupSecondary (conductor)
CREATE TABLE IF NOT EXISTS trips.TripPhotos (
    Id          UUID          NOT NULL DEFAULT gen_random_uuid(),
    TripId      UUID          NOT NULL,
    Url         TEXT          NOT NULL,
    Kind        SMALLINT      NOT NULL,
    UploadedBy  UUID          NOT NULL,
    CreatedAt   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT PK_TripPhotos PRIMARY KEY (Id),
    CONSTRAINT FK_TripPhotos_Trip
        FOREIGN KEY (TripId) REFERENCES trips.Trips(Id) ON DELETE CASCADE,
    CONSTRAINT CK_TripPhotos_Kind CHECK (Kind BETWEEN 0 AND 2)
);

CREATE INDEX IF NOT EXISTS IX_TripPhotos_TripId ON trips.TripPhotos (TripId);
