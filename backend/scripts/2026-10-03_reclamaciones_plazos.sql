-- =====================================================================
-- Libro de Reclamaciones: plazos configurables, feriados y anti-bot (03/10/2026)
--
-- 1) landing.systemsettings:
--      complaint_response_days  plazo de respuesta en dias habiles (15)
--      complaint_due_soon_days  "por vencer" = le quedan N dias habiles o menos (3)
--    La fecha limite se calcula al crear la hoja y se guarda: cambiar el
--    plazo no mueve las hojas ya registradas.
-- 2) landing.holidays: feriados que NO cuentan como dias habiles.
--      fijo   mes/dia, se repite cada anio
--      movil  calculado desde la Pascua: jueves_santo | viernes_santo
--      extra  una fecha exacta de un anio (se puede borrar)
--    Se precargan los feriados nacionales de Peru (editables/desactivables).
-- 3) landing.complaints: marca de posible bot (campo trampa del formulario)
--    y estado 'descartada'.
-- 4) landing.complaints: estado 'anulada' y datos del cierre (motivo, quien y
--    cuando) para anuladas y descartadas; plazo guardado por hoja
--    (ResponseDays: dias habiles vigentes al registrarla o validarla).
--
-- Idempotente: se puede ejecutar varias veces. No borra filas.
-- =====================================================================
BEGIN;

-- ── 1) Plazos ───────────────────────────────────────────────────────────
INSERT INTO landing.systemsettings (settingkey, value, description) VALUES
  ('complaint_response_days', '15', 'Plazo para responder una reclamacion, en dias habiles (sin sabados, domingos ni feriados). Se aplica a las nuevas.'),
  ('complaint_due_soon_days', '3',  'Una reclamacion pendiente se marca "por vencer" cuando le quedan estos dias habiles o menos.')
ON CONFLICT (settingkey) DO NOTHING;

-- ── 2) Feriados ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS landing.holidays (
    Id         UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    Name       VARCHAR(100) NOT NULL,
    Kind       VARCHAR(10)  NOT NULL CHECK (Kind IN ('fijo', 'movil', 'extra')),
    Month      INT          CHECK (Month BETWEEN 1 AND 12),          -- fijo
    Day        INT          CHECK (Day BETWEEN 1 AND 31),            -- fijo
    Movable    VARCHAR(20)  CHECK (Movable IN ('jueves_santo', 'viernes_santo')), -- movil
    Date       DATE,                                                 -- extra
    IsActive   BOOLEAN      NOT NULL DEFAULT TRUE,
    CreatedAt  TIMESTAMP    NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    CONSTRAINT ck_holidays_kind CHECK (
        (Kind = 'fijo'  AND Month IS NOT NULL AND Day IS NOT NULL AND Movable IS NULL AND Date IS NULL) OR
        (Kind = 'movil' AND Movable IS NOT NULL AND Month IS NULL AND Day IS NULL AND Date IS NULL) OR
        (Kind = 'extra' AND Date IS NOT NULL AND Month IS NULL AND Day IS NULL AND Movable IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_fijo  ON landing.holidays (Month, Day) WHERE Kind = 'fijo';
CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_movil ON landing.holidays (Movable)    WHERE Kind = 'movil';
CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_extra ON landing.holidays (Date)       WHERE Kind = 'extra';

-- Feriados nacionales de Peru (el dueno revisara la lista).
INSERT INTO landing.holidays (Name, Kind, Month, Day)
SELECT v.Name, 'fijo', v.Month, v.Day
FROM (VALUES
  ('Año Nuevo',                                1,  1),
  ('Día del Trabajo',                          5,  1),
  ('Batalla de Arica y Día de la Bandera',     6,  7),
  ('San Pedro y San Pablo',                    6, 29),
  ('Día de la Fuerza Aérea',                   7, 23),
  ('Fiestas Patrias',                          7, 28),
  ('Fiestas Patrias',                          7, 29),
  ('Batalla de Junín',                         8,  6),
  ('Santa Rosa de Lima',                       8, 30),
  ('Combate de Angamos',                      10,  8),
  ('Todos los Santos',                        11,  1),
  ('Inmaculada Concepción',                   12,  8),
  ('Batalla de Ayacucho',                     12,  9),
  ('Navidad',                                 12, 25)
) AS v(Name, Month, Day)
WHERE NOT EXISTS (
  SELECT 1 FROM landing.holidays h WHERE h.Kind = 'fijo' AND h.Month = v.Month AND h.Day = v.Day);

INSERT INTO landing.holidays (Name, Kind, Movable)
SELECT v.Name, 'movil', v.Movable
FROM (VALUES
  ('Jueves Santo',  'jueves_santo'),
  ('Viernes Santo', 'viernes_santo')
) AS v(Name, Movable)
WHERE NOT EXISTS (
  SELECT 1 FROM landing.holidays h WHERE h.Kind = 'movil' AND h.Movable = v.Movable);

-- ── 3) Anti-bot en las hojas ───────────────────────────────────────────
ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS IsBot     BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS BotReason VARCHAR(200);

-- (El CHECK de Status, con 'descartada' y 'anulada', esta en la seccion 4.)
CREATE INDEX IF NOT EXISTS idx_complaints_isbot ON landing.complaints (IsBot) WHERE IsBot;

-- ── 4) Anular / descartar con motivo y plazo por hoja ──────────────────
ALTER TABLE landing.complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE landing.complaints ADD CONSTRAINT complaints_status_check
    CHECK (Status IN ('pendiente', 'respondida', 'descartada', 'anulada'));

ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS ClosedReason VARCHAR(500);
ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS ClosedAt     TIMESTAMP;
ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS ClosedBy     UUID;
ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS ClosedByName VARCHAR(150);

-- Plazo de cada hoja: las ya registradas se hicieron con 15 dias habiles.
ALTER TABLE landing.complaints ADD COLUMN IF NOT EXISTS ResponseDays INT;
UPDATE landing.complaints SET ResponseDays = 15 WHERE ResponseDays IS NULL;
ALTER TABLE landing.complaints ALTER COLUMN ResponseDays SET DEFAULT 15;
ALTER TABLE landing.complaints ALTER COLUMN ResponseDays SET NOT NULL;

COMMIT;
