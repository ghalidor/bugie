-- =====================================================================
-- Sobrante de cupones 2026-10-08
-- Regla del dueno: si un cupon de monto (discount_amount o free_trip) vale
-- MAS que la tarifa del viaje, el viaje sale gratis y la diferencia vuelve
-- al pasajero en PUNTOS al completar el viaje (tasa points_rate_passenger,
-- redondeo hacia abajo).
--
-- trips.trips guarda el sobrante calculado al aplicar el cupon, para que el
-- pasajero (app y web) y el admin lo vean en el resumen del viaje:
--   * couponleftover       soles que sobran del cupon (null = no sobra).
--   * couponleftoverpoints esos soles en puntos (null = no sobra).
-- Lo que se acredita de verdad queda en rewards.pointstransactions con
-- sourceevent = 'coupon_leftover' y referenceid = id del viaje (el indice
-- unico uq_pointstransactions_source_ref impide acreditarlo dos veces).
-- No hace falta tocar rewards: sourceevent es varchar(50) sin CHECK.
--
-- Requisito: ninguno en especial (columnas sin fechas).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

ALTER TABLE trips.trips
    ADD COLUMN IF NOT EXISTS couponleftover       numeric(10,2),
    ADD COLUMN IF NOT EXISTS couponleftoverpoints integer;

COMMENT ON COLUMN trips.trips.couponleftover IS
    'Cupon de monto que vale mas que la tarifa: soles que sobran y vuelven al pasajero en puntos al completar. NULL = no sobra.';
COMMENT ON COLUMN trips.trips.couponleftoverpoints IS
    'Sobrante del cupon en puntos (tasa del pasajero, redondeo hacia abajo). NULL = no sobra.';

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-08_cupon_sobrante')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
