-- =====================================================================
-- 2026-10-03  Cobro con código (pagos a conductores)
-- Idempotente: se puede ejecutar varias veces.
--   1) Código de premio de sorteo (PZ-XXXXXX): lo trae el conductor para cobrar.
--   2) Correlativo de comprobante para pagos manuales (PAG-2026-000123).
-- =====================================================================

-- 1) Código de premio en cada ganador de sorteo ------------------------
-- Mismo alfabeto que los códigos de canje: sin 0, O, 1 ni I.
CREATE OR REPLACE FUNCTION rewards.gen_prize_code() RETURNS varchar AS $$
DECLARE
    alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code     text := 'PZ-';
    i        int;
BEGIN
    FOR i IN 1..6 LOOP
        code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    END LOOP;
    RETURN code;
END $$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE rewards.rafflewinners ADD COLUMN IF NOT EXISTS prizecode varchar(20);
UPDATE rewards.rafflewinners SET prizecode = rewards.gen_prize_code() WHERE prizecode IS NULL;
ALTER TABLE rewards.rafflewinners ALTER COLUMN prizecode SET DEFAULT rewards.gen_prize_code();
ALTER TABLE rewards.rafflewinners ALTER COLUMN prizecode SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rafflewinners_prizecode ON rewards.rafflewinners (prizecode);

-- 2) Comprobante de pagos manuales ----------------------------------------
CREATE SEQUENCE IF NOT EXISTS payments.payout_receipt_seq START 1;

-- Los pagos manuales anteriores reciben su comprobante (en orden de fecha).
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id, COALESCE(paidat, createdat) AS fecha
             FROM payments.withdrawals
             WHERE sourcetype = 'manual' AND sourceref IS NULL
             ORDER BY COALESCE(paidat, createdat)
    LOOP
        UPDATE payments.withdrawals
           SET sourceref = 'PAG-' || EXTRACT(YEAR FROM r.fecha)::int || '-'
                           || lpad(nextval('payments.payout_receipt_seq')::text, 6, '0')
         WHERE id = r.id;
    END LOOP;
END $$;

-- Los pagos de premios hechos antes guardaban el id del ganador: se pasa a su código PZ.
UPDATE payments.withdrawals w
   SET sourceref = rw.prizecode
  FROM rewards.rafflewinners rw
 WHERE w.sourcetype = 'raffle_prize'
   AND w.sourceref = rw.id::text;
