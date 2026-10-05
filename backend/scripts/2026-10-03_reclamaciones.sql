-- =====================================================================
-- Libro de Reclamaciones + Datos de la empresa (03/10/2026)
--
-- 1) landing.systemsettings: datos legales de la empresa (una sola fuente).
--    El telefono y el correo de soporte YA existen (support_phone /
--    support_email) y se reusan: no se duplican aqui.
-- 2) landing.complaints: hojas de reclamacion (formato Indecopi).
--    Numero correlativo por anio: LR-AAAA-NNNNNN.
--    Plazo de respuesta: 15 dias habiles (lunes a viernes).
-- 3) landing.complaintcounters: contador del correlativo por anio.
--
-- Fechas en UTC (timestamp sin zona), igual que el resto de landing.
-- Idempotente: se puede ejecutar varias veces. No borra filas.
-- =====================================================================
BEGIN;

-- ── 1) Datos de la empresa ──────────────────────────────────────────────
INSERT INTO landing.systemsettings (settingkey, value, description) VALUES
  ('company_legal_name', 'InteliaDevs S.A.C.', 'Razon social. Sale en el Libro de Reclamaciones, sus correos y el pie de la web.'),
  ('company_ruc',        '',                   'RUC de la empresa. Sale en el Libro de Reclamaciones y sus correos.'),
  ('company_address',    '',                   'Direccion fiscal. Sale en el Libro de Reclamaciones y sus correos.'),
  ('company_logo_url',   '',                   'Logo de la empresa (se sube desde Datos de la empresa). Sale en el Libro de Reclamaciones y sus correos.')
ON CONFLICT (settingkey) DO NOTHING;

-- ── 2) Hojas de reclamacion ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS landing.complaints (
    Id               UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    Code             VARCHAR(20)   NOT NULL UNIQUE,          -- LR-2026-000001
    Year             INT           NOT NULL,
    Seq              INT           NOT NULL,
    CreatedAt        TIMESTAMP     NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    -- 1. Consumidor
    ConsumerName     VARCHAR(150)  NOT NULL,
    ConsumerAddress  VARCHAR(250)  NOT NULL,
    DocType          VARCHAR(5)    NOT NULL CHECK (DocType IN ('DNI', 'CE')),
    DocNumber        VARCHAR(20)   NOT NULL,
    Phone            VARCHAR(20)   NOT NULL,
    Email            VARCHAR(150)  NOT NULL,
    GuardianName     VARCHAR(150),                           -- menor de edad: padre/madre/apoderado
    UserId           UUID,                                   -- si lo envio un usuario con sesion
    -- 2. Bien contratado
    GoodType         VARCHAR(10)   NOT NULL CHECK (GoodType IN ('producto', 'servicio')),
    ClaimedAmount    NUMERIC(10,2) CHECK (ClaimedAmount IS NULL OR ClaimedAmount >= 0),
    GoodDescription  VARCHAR(500),
    -- 3. Detalle
    ComplaintType    VARCHAR(10)   NOT NULL CHECK (ComplaintType IN ('reclamo', 'queja')),
    TripId           UUID,                                   -- viaje o envio relacionado (opcional)
    TripCode         VARCHAR(60),
    Reference        VARCHAR(200),
    Detail           TEXT          NOT NULL,
    Request          TEXT          NOT NULL,
    -- Atencion
    Status           VARCHAR(12)   NOT NULL DEFAULT 'pendiente' CHECK (Status IN ('pendiente', 'respondida')),
    DueDate          DATE          NOT NULL,                 -- 15 dias habiles (hora de Peru)
    Response         TEXT,
    RespondedAt      TIMESTAMP,
    RespondedBy      UUID,
    RespondedByName  VARCHAR(150),
    ResponseEmailSent BOOLEAN      NOT NULL DEFAULT FALSE,
    ConfirmationEmailSent BOOLEAN  NOT NULL DEFAULT FALSE,
    AccessToken      VARCHAR(64)   NOT NULL,                 -- para la consulta publica
    CONSTRAINT uq_complaints_year_seq UNIQUE (Year, Seq)
);

CREATE INDEX IF NOT EXISTS idx_complaints_status_due ON landing.complaints (Status, DueDate);
CREATE INDEX IF NOT EXISTS idx_complaints_created    ON landing.complaints (CreatedAt DESC);

-- ── 3) Correlativo por anio ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS landing.complaintcounters (
    Year INT NOT NULL PRIMARY KEY,
    Last INT NOT NULL
);

COMMIT;
