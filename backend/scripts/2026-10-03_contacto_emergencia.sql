-- =====================================================================
-- Contacto de emergencia 2026-10-03
-- Un contacto de emergencia por usuario (pasajero o conductor).
-- Se avisa por correo a este contacto cuando el usuario activa un SOS,
-- y el admin lo ve en el Centro SOS y en el detalle del usuario.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS auth.emergencycontacts (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    userid       uuid NOT NULL,
    fullname     character varying(120) NOT NULL,
    phone        character varying(20)  NOT NULL,
    relationship character varying(50)  NOT NULL,
    email        character varying(200),
    createdat    timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat    timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT emergencycontacts_pkey PRIMARY KEY (id),
    -- Un solo contacto por usuario.
    CONSTRAINT uq_emergencycontacts_user UNIQUE (userid),
    CONSTRAINT fk_emergencycontacts_user FOREIGN KEY (userid)
        REFERENCES auth.users (id) ON DELETE CASCADE
);

COMMIT;
