-- =====================================================================
-- 2026-10-03  Billetera del conductor (comisiones que le debe a Bugie)
--
-- Modelo: el conductor cobra TODO en mano (efectivo, Yape o Plin directo
-- a el). Bugie cobra una comision por viaje que el conductor le DEBE.
--
--   driverwallet.balance  = comision pagada - comision generada
--                           (negativo = deuda del conductor con Bugie)
--   driverwallet.totalearned          = ganancia neta (monto - comision)
--   driverwallet.totalcommission      = comision generada
--   driverwallet.totalcommissionpaid  = comision que ya pago
--
-- wallettransactions guarda cada movimiento:
--   'comision'       -> un viaje genero comision (baja el saldo)
--   'pago_comision'  -> el admin registro un pago de comision (sube el saldo)
--
-- Los pagos de Bugie al conductor (payments.withdrawals) NO tocan este saldo.
--
-- Idempotente: se puede correr varias veces.
-- =====================================================================

BEGIN;

-- 1. Billetera: totales de comision
ALTER TABLE payments.driverwallet
    ADD COLUMN IF NOT EXISTS totalcommission     numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS totalcommissionpaid numeric(12,2) NOT NULL DEFAULT 0;

-- 2. Movimientos: datos del viaje y del pago de comision
ALTER TABLE payments.wallettransactions
    ADD COLUMN IF NOT EXISTS tripid          uuid,
    ADD COLUMN IF NOT EXISTS tripamount      numeric(12,2),
    ADD COLUMN IF NOT EXISTS method          varchar(20),
    ADD COLUMN IF NOT EXISTS operationnumber varchar(50),
    ADD COLUMN IF NOT EXISTS note            varchar(300),
    ADD COLUMN IF NOT EXISTS paidat          timestamp without time zone,
    ADD COLUMN IF NOT EXISTS adminid         uuid,
    ADD COLUMN IF NOT EXISTS adminname       varchar(120);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_wallettx_type') THEN
        ALTER TABLE payments.wallettransactions
            ADD CONSTRAINT ck_wallettx_type CHECK (type IN ('comision', 'pago_comision'));
    END IF;
END $$;

-- Un viaje genera comision UNA sola vez (aunque Trips repita el POST)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallettx_trip_comision
    ON payments.wallettransactions (tripid) WHERE type = 'comision';

CREATE INDEX IF NOT EXISTS ix_wallettx_driver
    ON payments.wallettransactions (driverid, createdat DESC);

-- 3. Backfill: comision de los pagos ya existentes.
--    Solo para conductores que todavia no tienen movimientos, asi el saldo
--    corrido (balanceafter) sale bien y no se duplica nada.
INSERT INTO payments.driverwallet (driverid)
SELECT DISTINCT p.driverid
FROM payments.payments p
WHERE p.status = 'completed' AND p.amount > 0
ON CONFLICT (driverid) DO NOTHING;

INSERT INTO payments.wallettransactions
    (driverid, type, amount, reference, balanceafter, tripid, tripamount, createdat)
SELECT p.driverid,
       'comision',
       p.platformfee,
       'Comision del viaje',
       -SUM(p.platformfee) OVER (PARTITION BY p.driverid
                                 ORDER BY COALESCE(p.paidat, p.createdat), p.id),
       p.tripid,
       p.amount,
       COALESCE(p.paidat, p.createdat)
FROM payments.payments p
WHERE p.status = 'completed'
  AND p.amount > 0
  AND NOT EXISTS (SELECT 1 FROM payments.wallettransactions w WHERE w.driverid = p.driverid)
ON CONFLICT (tripid) WHERE type = 'comision' DO NOTHING;

-- 4. Totales de cada billetera recalculados desde sus movimientos
UPDATE payments.driverwallet dw SET
    totalcommission     = t.comision,
    totalcommissionpaid = t.pagado,
    totalearned         = t.neto,
    balance             = t.pagado - t.comision,
    updatedat           = now() AT TIME ZONE 'utc'
FROM (
    SELECT driverid,
           COALESCE(SUM(amount) FILTER (WHERE type = 'comision'), 0)                         AS comision,
           COALESCE(SUM(amount) FILTER (WHERE type = 'pago_comision'), 0)                    AS pagado,
           COALESCE(SUM(COALESCE(tripamount, 0) - amount) FILTER (WHERE type = 'comision'), 0) AS neto
    FROM payments.wallettransactions
    GROUP BY driverid
) t
WHERE t.driverid = dw.driverid
  AND (dw.totalcommission, dw.totalcommissionpaid, dw.totalearned, dw.balance)
      IS DISTINCT FROM (t.comision, t.pagado, t.neto, t.pagado - t.comision);

COMMIT;
