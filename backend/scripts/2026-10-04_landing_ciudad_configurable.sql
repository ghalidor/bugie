-- Textos del gestor de contenidos (landing): la ciudad deja de estar escrita a
-- mano y pasa a la plantilla {city} / {cityCountry}, que la web rellena con la
-- ciudad configurada (setting default_city o la ciudad de "Datos de la empresa").
--
-- Se mantienen tal cual (hablan de la EMPRESA o de un dato de Trujillo, no de
-- la ciudad de operacion):
--   - "InteliaDevs S.A.C. · Trujillo, Perú" (pie legal)
--   - "software engineers from Trujillo" / "ingenieros ... de Trujillo"
--   - "~30,000 taxis operando sin verificación en Trujillo" (dato de mercado)
-- Idempotente: al correrlo otra vez ya no hay nada que cambiar.

BEGIN;

-- Sesion en UTC: "now()" queda bien tanto en columnas timestamptz (base
-- migrada) como en timestamp en UTC (base anterior a 2026-10-08).
SET LOCAL timezone = 'UTC';

UPDATE landing.sectioncontents
SET contentjson =
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(contentjson,
        -- 1) proteger las excepciones
        'InteliaDevs S.A.C. · Trujillo, Perú', '@@LEGAL@@'),
        'engineers from Trujillo',              '@@ENG@@'),
        'sin verificación en Trujillo',          '@@TAXIS@@'),
        -- 2) ciudad de operacion -> plantilla
        'Trujillo, Perú', '{cityCountry}'),
        'Trujillo, Peru', '{cityCountry}'),
        'Trujillo',       '{city}'),
        -- 3) restaurar las excepciones
        '@@LEGAL@@', 'InteliaDevs S.A.C. · Trujillo, Perú'),
        '@@ENG@@',   'engineers from Trujillo'),
        '@@TAXIS@@', 'sin verificación en Trujillo'),
        '{city}, Peru', '{cityCountry}'),
    updatedat = now()
WHERE contentjson LIKE '%Trujillo%'
  AND replace(replace(replace(contentjson,
        'InteliaDevs S.A.C. · Trujillo, Perú', ''),
        'engineers from Trujillo', ''),
        'sin verificación en Trujillo', '') LIKE '%Trujillo%';

COMMIT;
