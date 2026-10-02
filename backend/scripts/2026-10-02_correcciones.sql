-- =====================================================================
-- Correcciones 2026-10-02
-- Alinea la base de datos con lo que el codigo ya usa.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) landing.contactmessages: columnas de lectura / respuesta
--    Usadas por ContactRepository (MarkAsRead, MarkAsUnread, AddReply).
-- ---------------------------------------------------------------------
ALTER TABLE landing.contactmessages
    ADD COLUMN IF NOT EXISTS readat       timestamp without time zone,
    ADD COLUMN IF NOT EXISTS readbyuserid uuid,
    ADD COLUMN IF NOT EXISTS lastreplyat  timestamp without time zone;

-- ---------------------------------------------------------------------
-- 2) landing.contactreplies: respuestas del admin a un mensaje
--    Usada por ContactRepository.AddReplyAsync / GetRepliesByContactAsync.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing.contactreplies (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    contactid    uuid NOT NULL,
    adminuserid  uuid,
    adminname    character varying(150),
    subject      text NOT NULL,
    body         text NOT NULL,
    status       character varying(20) DEFAULT 'sent' NOT NULL,
    errormessage text,
    createdat    timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT contactreplies_pkey PRIMARY KEY (id),
    CONSTRAINT fk_contactreplies_contact FOREIGN KEY (contactid)
        REFERENCES landing.contactmessages (id) ON DELETE CASCADE,
    CONSTRAINT ck_contactreplies_status CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_contactreplies_contactid
    ON landing.contactreplies (contactid, createdat DESC);

-- ---------------------------------------------------------------------
-- 3) drivers.drivers: permitir estado 6 (ExpiredDocs)
--    DriverStatus.ExpiredDocs = 6 lo asigna el job de documentos vencidos.
-- ---------------------------------------------------------------------
ALTER TABLE drivers.drivers DROP CONSTRAINT IF EXISTS ck_driver_status;
ALTER TABLE drivers.drivers
    ADD CONSTRAINT ck_driver_status CHECK (status >= 1 AND status <= 6);

-- ---------------------------------------------------------------------
-- 4) trips.tripproposals.status: 'accepted_by_passenger' tiene 21
--    caracteres y la columna era varchar(20).
-- ---------------------------------------------------------------------
ALTER TABLE trips.tripproposals ALTER COLUMN status TYPE character varying(30);

-- ---------------------------------------------------------------------
-- 5) auth.passwordresettokens: enlaces de "olvide mi contrasena".
--    Se guarda solo el hash del token. Vale 1 hora y un solo uso.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.passwordresettokens (
    id        uuid DEFAULT gen_random_uuid() NOT NULL,
    userid    uuid NOT NULL,
    tokenhash character varying(64) NOT NULL,
    expiresat timestamp without time zone NOT NULL,
    usedat    timestamp without time zone,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT passwordresettokens_pkey PRIMARY KEY (id),
    CONSTRAINT uq_passwordresettokens_hash UNIQUE (tokenhash),
    CONSTRAINT fk_passwordresettokens_user FOREIGN KEY (userid)
        REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_passwordresettokens_userid
    ON auth.passwordresettokens (userid);

-- ---------------------------------------------------------------------
-- 6) payments.withdrawals: registro de pagos a conductores
--    (bonos canjeados con puntos, premios de sorteo, pagos manuales).
--    El admin registra el pago ya hecho: metodo, n. de operacion, fecha.
--    driverid = id de usuario (auth.users) de quien recibe el pago.
-- ---------------------------------------------------------------------
ALTER TABLE payments.withdrawals
    ADD COLUMN IF NOT EXISTS drivername      character varying(120),
    ADD COLUMN IF NOT EXISTS operationnumber character varying(50),
    ADD COLUMN IF NOT EXISTS paidat          timestamp without time zone,
    ADD COLUMN IF NOT EXISTS paidbyadminid   uuid,
    ADD COLUMN IF NOT EXISTS paidbyadminname character varying(120),
    ADD COLUMN IF NOT EXISTS note            character varying(300),
    ADD COLUMN IF NOT EXISTS sourcetype      character varying(30) DEFAULT 'manual' NOT NULL,
    ADD COLUMN IF NOT EXISTS sourceref       character varying(60);

ALTER TABLE payments.withdrawals ALTER COLUMN accountref DROP NOT NULL;

ALTER TABLE payments.withdrawals DROP CONSTRAINT IF EXISTS ck_wd_method;
ALTER TABLE payments.withdrawals
    ADD CONSTRAINT ck_wd_method CHECK (method IN ('yape', 'plin', 'transferencia', 'efectivo'));

ALTER TABLE payments.withdrawals DROP CONSTRAINT IF EXISTS ck_wd_sourcetype;
ALTER TABLE payments.withdrawals
    ADD CONSTRAINT ck_wd_sourcetype CHECK (sourcetype IN ('reward_redemption', 'raffle_prize', 'manual'));

-- Un canje o un premio se paga una sola vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_wd_source
    ON payments.withdrawals (sourcetype, sourceref) WHERE sourceref IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_wd_driver_paidat
    ON payments.withdrawals (driverid, paidat);

-- ---------------------------------------------------------------------
-- 7) trips.tripproposals: estado 'cancelled' (el viaje se cancelo y se
--    cerro la negociacion). Trips.Api tambien lo asegura al arrancar.
-- ---------------------------------------------------------------------
ALTER TABLE trips.tripproposals DROP CONSTRAINT IF EXISTS ck_tripproposals_status;
ALTER TABLE trips.tripproposals
    ADD CONSTRAINT ck_tripproposals_status CHECK (status IN
        ('pending', 'accepted', 'rejected', 'superseded',
         'accepted_by_passenger', 'driver_accepted', 'cancelled'));

-- ---------------------------------------------------------------------
-- 8) trips.trips.cancelledat: cuando se cancelo el viaje (UTC).
-- ---------------------------------------------------------------------
ALTER TABLE trips.trips ADD COLUMN IF NOT EXISTS cancelledat timestamp without time zone;

-- ---------------------------------------------------------------------
-- 9) Envios: destinatario y confirmacion de entrega en destino.
--    tripphotos.kind 3 = foto de la entrega (DeliveryProof).
-- ---------------------------------------------------------------------
ALTER TABLE trips.trips
    ADD COLUMN IF NOT EXISTS recipientname       character varying(120),
    ADD COLUMN IF NOT EXISTS recipientphone      character varying(20),
    ADD COLUMN IF NOT EXISTS deliveryreceivedby  character varying(120),
    ADD COLUMN IF NOT EXISTS deliveryconfirmedat timestamp without time zone;

ALTER TABLE trips.tripphotos DROP CONSTRAINT IF EXISTS ck_tripphotos_kind;
ALTER TABLE trips.tripphotos
    ADD CONSTRAINT ck_tripphotos_kind CHECK (kind >= 0 AND kind <= 3);

COMMIT;
