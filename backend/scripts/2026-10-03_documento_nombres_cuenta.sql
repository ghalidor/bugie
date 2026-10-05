-- =====================================================================
-- Documento de identidad, nombres separados y eliminacion de cuenta
-- (2026-10-03)
-- - auth.users: tipo y numero de documento (DNI / CE / PASAPORTE),
--   nombres y apellidos separados (FullName se sigue usando y lo arma la
--   API = "Nombres Paterno Materno"), y estado "Eliminada" (deletedat,
--   deletedreason). Nada se borra: la cuenta eliminada queda con
--   isactive = false y todos sus datos.
-- - Solo UNA cuenta NO eliminada por (doctype, docnumber).
-- - auth.useraccountaudit: auditoria de eliminar, restaurar y cambios de
--   documento / nombres (por el admin o el propio usuario).
-- - Usuarios existentes: el documento queda NULL (lo completan una vez
--   desde la app/web) y los nombres se separan desde fullname:
--   ultima palabra = materno, penultima = paterno, resto = nombres;
--   con 2 palabras: nombres + paterno; con 1 palabra: solo nombres.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) auth.users: columnas nuevas
--    doctype:          'DNI' | 'CE' | 'PASAPORTE' (NULL = aun no lo completa)
--    docnumber:        normalizado (mayusculas, sin espacios)
--    firstnames:       nombres
--    lastnamepaternal: apellido paterno
--    lastnamematernal: apellido materno (opcional: extranjeros con un apellido)
--    deletedat:        UTC; NULL = cuenta no eliminada
--    deletedreason:    motivo que dio el usuario al eliminar (opcional)
-- ---------------------------------------------------------------------
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS doctype          character varying(10),
    ADD COLUMN IF NOT EXISTS docnumber        character varying(12),
    ADD COLUMN IF NOT EXISTS firstnames       character varying(60),
    ADD COLUMN IF NOT EXISTS lastnamepaternal character varying(40),
    ADD COLUMN IF NOT EXISTS lastnamematernal character varying(40),
    ADD COLUMN IF NOT EXISTS deletedat        timestamp without time zone,
    ADD COLUMN IF NOT EXISTS deletedreason    character varying(500);

-- fullname = nombres (60) + paterno (40) + materno (40) + 2 espacios
ALTER TABLE auth.users ALTER COLUMN fullname TYPE character varying(150);

ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS ck_users_doctype;
ALTER TABLE auth.users ADD CONSTRAINT ck_users_doctype
    CHECK (doctype IS NULL OR doctype IN ('DNI', 'CE', 'PASAPORTE'));

-- Tipo y numero van juntos (los dos o ninguno)
ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS ck_users_document_pair;
ALTER TABLE auth.users ADD CONSTRAINT ck_users_document_pair
    CHECK ((doctype IS NULL) = (docnumber IS NULL));

-- Una sola cuenta NO eliminada por documento
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_document_active
    ON auth.users (doctype, docnumber)
    WHERE deletedat IS NULL AND docnumber IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_users_deletedat
    ON auth.users (deletedat)
    WHERE deletedat IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Separar los nombres de los usuarios existentes (solo los que aun no
--    tienen nombres separados).
-- ---------------------------------------------------------------------
WITH partes AS (
    SELECT id,
           regexp_split_to_array(btrim(regexp_replace(fullname, '\s+', ' ', 'g')), ' ') AS p
      FROM auth.users
     WHERE firstnames IS NULL AND lastnamepaternal IS NULL
       AND btrim(coalesce(fullname, '')) <> ''
)
UPDATE auth.users u
   SET firstnames = left(CASE
                          WHEN cardinality(x.p) >= 3 THEN array_to_string(x.p[1:cardinality(x.p) - 2], ' ')
                          ELSE x.p[1]
                        END, 60),
       lastnamepaternal = left(CASE
                          WHEN cardinality(x.p) >= 3 THEN x.p[cardinality(x.p) - 1]
                          WHEN cardinality(x.p) = 2  THEN x.p[2]
                          ELSE NULL
                        END, 40),
       lastnamematernal = left(CASE
                          WHEN cardinality(x.p) >= 3 THEN x.p[cardinality(x.p)]
                          ELSE NULL
                        END, 40)
  FROM partes x
 WHERE u.id = x.id;

-- ---------------------------------------------------------------------
-- 3) auth.useraccountaudit
--    action: deleted            = el usuario elimino su cuenta
--            restored           = el admin restauro la cuenta
--            document_changed   = el admin corrigio el documento
--            names_changed      = el admin corrigio los nombres
--            profile_completed  = el usuario completo documento/nombres
--    actorrole: user | admin
--    oldvalue / newvalue: texto legible (ej. "DNI 12345678").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.useraccountaudit (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    userid      uuid NOT NULL,
    action      character varying(30) NOT NULL,
    actoruserid uuid,
    actorname   character varying(150),
    actorrole   character varying(20) NOT NULL,
    reason      text,
    oldvalue    text,
    newvalue    text,
    createdat   timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT useraccountaudit_pkey PRIMARY KEY (id),
    CONSTRAINT fk_useraccountaudit_user FOREIGN KEY (userid)
        REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT ck_useraccountaudit_action CHECK (action IN
        ('deleted', 'restored', 'document_changed', 'names_changed', 'profile_completed')),
    CONSTRAINT ck_useraccountaudit_actorrole CHECK (actorrole IN ('user', 'admin'))
);

CREATE INDEX IF NOT EXISTS ix_useraccountaudit_user
    ON auth.useraccountaudit (userid, createdat DESC);

COMMIT;
