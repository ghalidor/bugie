-- =====================================================================
-- Verificacion facial de conductores 2026-10-08
--
-- Interruptor en Configuracion: face_verification_enabled (por defecto
-- "false" = todo como antes: solo se guarda la selfie de conexion y la foto
-- de perfil se cambia directo).
--
-- Encendido:
--   * Al conectarse, la selfie se compara con la huella facial de referencia
--     del conductor (similitud coseno >= face_match_threshold, por defecto
--     0.363, el recomendado del modelo SFace). El conductor sigue trabajando
--     aunque no coincida: es interno, el admin revisa.
--   * La foto de perfil nueva se aprueba sola si coincide con la referencia;
--     si no coincide o es la primera, queda pendiente de revision del admin.
--     Maximo profile_photo_daily_limit intentos por dia de Peru (por defecto 3).
--
-- 1. drivers.driverfacereferences: huella de referencia de cada conductor
--    (la de su foto de perfil aprobada), con quien y cuando la aprobo.
-- 2. drivers.driverprofilephotoattempts: cada foto de perfil subida (foto,
--    puntaje, estado, quien reviso). Una sola pendiente por conductor.
-- 3. drivers.driverpresencecheckins: resultado de la verificacion de cada
--    conexion y la revision del admin.
-- 4. Settings (landing.systemsettings): interruptor, umbral, limite diario y
--    la configuracion de los 2 avisos nuevos del panel.
--
-- Fechas timestamptz (requisito: 2026-10-08_fechas_timestamptz.sql aplicado).
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- ── 1. Huella facial de referencia ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers.driverfacereferences (
    driverid       uuid PRIMARY KEY
                   REFERENCES drivers.drivers(id) ON DELETE CASCADE,
    embedding      real[],                         -- NULL = la foto aprobada no tiene un rostro detectable
    model          varchar(60),                    -- motor con que se calculo (no se mezclan motores)
    photourl       varchar(500) NOT NULL,          -- foto de perfil aprobada (URL publica)
    fileid         varchar(500),                   -- ruta del archivo (para recalcular si cambia el motor)
    attemptid      uuid,                           -- intento de foto que la origino
    autoapproved   boolean NOT NULL DEFAULT false, -- true = coincidio con la anterior
    approvedby     uuid,                           -- admin (NULL = automatico)
    approvedbyname text,
    approvedat     timestamp with time zone NOT NULL DEFAULT now()
);

-- ── 2. Intentos de foto de perfil ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers.driverprofilephotoattempts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driverid         uuid NOT NULL REFERENCES drivers.drivers(id) ON DELETE CASCADE,
    photourl         varchar(500) NOT NULL,
    fileid           varchar(500),
    previousphotourl varchar(500),                 -- foto de perfil vigente al subir
    embedding        real[],
    model            varchar(60),
    score            real,                         -- similitud con la referencia (NULL = no se comparo)
    faceresult       varchar(20) NOT NULL,         -- match | mismatch | no_reference | error | disabled
    faceerror        text,
    status           varchar(20) NOT NULL,         -- approved | pending_review | rejected | replaced
    autoapproved     boolean NOT NULL DEFAULT false,
    reason           text,                         -- motivo del rechazo (lo ve el conductor)
    reviewedby       uuid,
    reviewedbyname   text,
    reviewedat       timestamp with time zone,
    createdat        timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT ck_profilephoto_status
        CHECK (status IN ('approved', 'pending_review', 'rejected', 'replaced')),
    CONSTRAINT ck_profilephoto_faceresult
        CHECK (faceresult IN ('match', 'mismatch', 'no_reference', 'error', 'disabled'))
);

CREATE INDEX IF NOT EXISTS ix_profilephotoattempts_driver_created
    ON drivers.driverprofilephotoattempts (driverid, createdat DESC);
CREATE INDEX IF NOT EXISTS ix_profilephotoattempts_created
    ON drivers.driverprofilephotoattempts (createdat DESC);
-- Una sola foto pendiente por conductor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profilephotoattempts_one_pending
    ON drivers.driverprofilephotoattempts (driverid) WHERE status = 'pending_review';

-- ── 3. Resultado de la verificacion en cada conexion ────────────────────
ALTER TABLE drivers.driverpresencecheckins
    ADD COLUMN IF NOT EXISTS liveness              varchar(20),   -- "passed" si la app hizo la prueba de vida
    ADD COLUMN IF NOT EXISTS facestatus            varchar(20),   -- disabled | match | mismatch | no_reference | error (NULL = antes de esta funcion)
    ADD COLUMN IF NOT EXISTS facescore             real,
    ADD COLUMN IF NOT EXISTS facemodel             varchar(60),
    ADD COLUMN IF NOT EXISTS facereferencephotourl varchar(500),  -- referencia usada en ese momento
    ADD COLUMN IF NOT EXISTS faceerror             text,
    ADD COLUMN IF NOT EXISTS facereviewstatus      varchar(20),   -- pending | confirmed_ok | not_him
    ADD COLUMN IF NOT EXISTS facereviewnote        text,
    ADD COLUMN IF NOT EXISTS facereviewedby        uuid,
    ADD COLUMN IF NOT EXISTS facereviewedbyname    text,
    ADD COLUMN IF NOT EXISTS facereviewedat        timestamp with time zone;

CREATE INDEX IF NOT EXISTS ix_driverpresencecheckins_facestatus
    ON drivers.driverpresencecheckins (checkedinat DESC) WHERE facestatus IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_driverpresencecheckins_facereview_pending
    ON drivers.driverpresencecheckins (checkedinat DESC) WHERE facereviewstatus = 'pending';

-- ── 4. Configuracion ────────────────────────────────────────────────────
INSERT INTO landing.systemsettings (settingkey, value, description) VALUES
 ('face_verification_enabled', 'false',
  'Verificación facial de conductores: compara la selfie de conexión y la foto de perfil con su foto de referencia aprobada.'),
 ('face_match_threshold', '0.363',
  'Similitud mínima (0 a 1) para considerar que es la misma persona. Recomendado del modelo: 0.363.'),
 ('profile_photo_daily_limit', '3',
  'Fotos de perfil que un conductor puede subir por día (hora de Perú) con la verificación facial encendida.'),
 ('admin_notify_face_mismatch',
  '{"enabled":true,"color":"warn","duration":8}',
  'Aviso en vivo: la selfie de conexión de un conductor no coincide con su foto de referencia.'),
 ('admin_notify_profile_photo_review',
  '{"enabled":true,"color":"primary","duration":6}',
  'Aviso en vivo: un conductor subió una foto de perfil que hay que revisar.')
ON CONFLICT (settingkey) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bugie_migraciones (
    nombre   varchar(100) PRIMARY KEY,
    aplicada timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.bugie_migraciones (nombre) VALUES ('2026-10-08_verificacion_facial')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
