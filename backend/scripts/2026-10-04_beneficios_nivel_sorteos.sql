-- =====================================================================
-- Beneficios de nivel con cupones y cupon de ticket de sorteo (2026-10-04)
--
-- 1. rewards.levels: dos columnas nuevas (solo las usa el PASAJERO)
--    - monthlydiscountcoupons: cuantos cupones de su DiscountPercentage
--      puede reclamar al mes.
--    - freetripmaxamount: tope en soles de cada viaje gratis del mes
--      (MonthlyFreeTrips). NULL = sin viajes gratis.
--    Valores iniciales del pasajero (solo si siguen en 0 / NULL):
--      Bronce 1 / NULL, Plata 2 / NULL, Oro 3 / 15.00, Platino 4 / 25.00.
--
-- 2. rewards.redemptions: los cupones de nivel no vienen del catalogo ni
--    cuestan puntos. Por eso CatalogItemId pasa a aceptar NULL y
--    PointsSpent acepta 0.
--
-- 3. rewards.levelbenefitclaims: un registro por cupon de nivel reclamado.
--    Sirve para contar el cupo usado del mes (period = 'YYYY-MM', mes local
--    de Peru segun timezone_offset_hours).
--
-- 4. rewards.levelbenefitnotices: marca "ya se aviso al usuario sus
--    beneficios de este mes", para que el aviso mensual salga una sola vez.
--
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- -- 1. Niveles ------------------------------------------------------
ALTER TABLE rewards.levels
    ADD COLUMN IF NOT EXISTS monthlydiscountcoupons integer NOT NULL DEFAULT 0;
ALTER TABLE rewards.levels
    ADD COLUMN IF NOT EXISTS freetripmaxamount numeric(10,2);

ALTER TABLE rewards.levels DROP CONSTRAINT IF EXISTS ck_rewardslevels_discountcoupons;
ALTER TABLE rewards.levels ADD CONSTRAINT ck_rewardslevels_discountcoupons
    CHECK (monthlydiscountcoupons >= 0);

ALTER TABLE rewards.levels DROP CONSTRAINT IF EXISTS ck_rewardslevels_freetripmax;
ALTER TABLE rewards.levels ADD CONSTRAINT ck_rewardslevels_freetripmax
    CHECK (freetripmaxamount IS NULL OR freetripmaxamount > 0);

UPDATE rewards.levels SET monthlydiscountcoupons = v.cupones, updatedat = now() AT TIME ZONE 'UTC'
FROM (VALUES ('bronze', 1), ('silver', 2), ('gold', 3), ('platinum', 4)) AS v(nombre, cupones)
WHERE usertype = 'passenger' AND name = v.nombre AND monthlydiscountcoupons = 0;

UPDATE rewards.levels SET freetripmaxamount = v.tope, updatedat = now() AT TIME ZONE 'UTC'
FROM (VALUES ('gold', 15.00), ('platinum', 25.00)) AS v(nombre, tope)
WHERE usertype = 'passenger' AND name = v.nombre AND freetripmaxamount IS NULL;

-- -- 2. Cupones sin catalogo y sin costo -----------------------------
ALTER TABLE rewards.redemptions ALTER COLUMN catalogitemid DROP NOT NULL;

ALTER TABLE rewards.redemptions DROP CONSTRAINT IF EXISTS ck_redemptions_points;
ALTER TABLE rewards.redemptions ADD CONSTRAINT ck_redemptions_points
    CHECK (pointsspent >= 0);

-- -- 3. Reclamos de beneficios de nivel ------------------------------
CREATE TABLE IF NOT EXISTS rewards.levelbenefitclaims (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profileid    uuid NOT NULL REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE,
    userid       uuid NOT NULL,
    benefittype  varchar(20) NOT NULL,
    period       varchar(7)  NOT NULL,
    levelname    varchar(20) NOT NULL,
    redemptionid uuid NOT NULL REFERENCES rewards.redemptions(id) ON DELETE CASCADE,
    createdat    timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    CONSTRAINT ck_levelbenefitclaims_type CHECK (benefittype IN ('discount', 'free_trip'))
);

CREATE INDEX IF NOT EXISTS ix_levelbenefitclaims_user_period
    ON rewards.levelbenefitclaims (userid, period);

-- -- 4. Aviso mensual (una vez por usuario y mes) --------------------
CREATE TABLE IF NOT EXISTS rewards.levelbenefitnotices (
    userid    uuid       NOT NULL,
    period    varchar(7) NOT NULL,
    createdat timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    PRIMARY KEY (userid, period)
);

COMMIT;
