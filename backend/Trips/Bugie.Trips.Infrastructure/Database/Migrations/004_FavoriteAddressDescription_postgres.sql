-- ============================================================================
-- Migracion: 004_FavoriteAddressDescription_postgres.sql  (PostgreSQL)
-- Direcciones guardadas: agrega Description (opcional) y fuerza nombre unico
-- por pasajero (case-insensitive). Aplicar a mano si la BD ya existe:
--   psql ... -f 004_FavoriteAddressDescription_postgres.sql
-- ============================================================================
ALTER TABLE trips.favoriteaddresses ADD COLUMN IF NOT EXISTS Description TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS UX_FavoriteAddresses_Passenger_Label
    ON trips.favoriteaddresses (PassengerId, LOWER(Label));
