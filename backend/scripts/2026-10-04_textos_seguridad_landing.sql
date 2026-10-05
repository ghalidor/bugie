-- Corrige los textos del gestor de contenidos (landing) que prometian cosas
-- que el sistema no hace:
--   - no hay reconocimiento facial: solo se registra una selfie al conectarse;
--   - el SOS avisa al centro de monitoreo y a los administradores (y por correo
--     al contacto de emergencia); la Policia la contacta el equipo a mano;
--   - "Alianza tactica" no es del sistema: se reemplaza por Libro de Reclamaciones.
-- Secciones: safety (es/en), auth (es/en), stats (es). Idempotente.

-- safety
UPDATE landing.sectioncontents c
SET contentjson = (
      jsonb_set(c.contentjson::jsonb, '{features}', (
        SELECT coalesce(jsonb_agg(CASE
          WHEN f->>'icon' IN ('fa-fingerprint','fa-camera') THEN jsonb_build_object('icon','fa-camera',
               'title', CASE WHEN c.lang='en' THEN 'Selfie when connecting' ELSE 'Selfie al conectarse' END,
               'text',  CASE WHEN c.lang='en' THEN 'The driver takes a photo every time they connect, and it is recorded.'
                             ELSE 'El conductor se toma una foto cada vez que se conecta y queda registrada.' END)
          WHEN f->>'icon' = 'fa-triangle-exclamation' THEN f || jsonb_build_object(
               'title', CASE WHEN c.lang='en' THEN 'SOS button' ELSE 'Botón SOS' END,
               'text',  CASE WHEN c.lang='en' THEN 'The alert reaches the monitoring center and the administrators, and your emergency contact gets an email.'
                             ELSE 'La alerta llega al centro de monitoreo y a los administradores, y se avisa por correo a tu contacto de emergencia.' END)
          WHEN f->>'icon' IN ('fa-handshake','fa-book') THEN jsonb_build_object('icon','fa-book',
               'title', CASE WHEN c.lang='en' THEN 'Complaints Book' ELSE 'Libro de Reclamaciones' END,
               'text',  CASE WHEN c.lang='en' THEN 'File your complaint online and check its status with your code.'
                             ELSE 'Registra tu reclamo en línea y consulta su estado con tu código.' END)
          ELSE f END ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(c.contentjson::jsonb->'features') WITH ORDINALITY e(f, ord)))
      || jsonb_build_object('subtitle', CASE WHEN c.lang='en'
             THEN 'Physical verification, continuous monitoring and a team that responds to every alert.'
             ELSE 'Verificación física, monitoreo continuo y un equipo que atiende cada alerta.' END)
    )::text,
    updatedat = now() AT TIME ZONE 'utc'
FROM landing.sections s
WHERE s.id = c.sectionid AND s.sectionkey = 'safety'
  AND jsonb_typeof(c.contentjson::jsonb->'features') = 'array';

-- auth (pantalla de ingreso)
UPDATE landing.sectioncontents c
SET contentjson = jsonb_set(c.contentjson::jsonb, '{features}', (
        SELECT coalesce(jsonb_agg(CASE
          WHEN f->>'icon' = 'fa-shield-halved' THEN f || jsonb_build_object('text', CASE WHEN c.lang='en'
               THEN 'Documents and background checked in person, and a selfie recorded when connecting.'
               ELSE 'Documentos y antecedentes revisados en persona, y selfie registrada al conectarse.' END)
          WHEN f->>'icon' = 'fa-triangle-exclamation' THEN f || jsonb_build_object('text', CASE WHEN c.lang='en'
               THEN 'Direct alert to the monitoring center and the administrators.'
               ELSE 'Alerta directa al centro de monitoreo y a los administradores.' END)
          ELSE f END ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(c.contentjson::jsonb->'features') WITH ORDINALITY e(f, ord)))::text,
    updatedat = now() AT TIME ZONE 'utc'
FROM landing.sections s
WHERE s.id = c.sectionid AND s.sectionkey = 'auth'
  AND jsonb_typeof(c.contentjson::jsonb->'features') = 'array';

-- stats (inicio): tarjeta "Reconocimiento y validacion"
UPDATE landing.sectioncontents c
SET contentjson = jsonb_set(c.contentjson::jsonb, '{features}', (
        SELECT coalesce(jsonb_agg(CASE
          WHEN f->>'icon' IN ('fa-fingerprint','fa-camera') THEN jsonb_build_object('icon','fa-camera',
               'title', CASE WHEN c.lang='en' THEN 'Identity control' ELSE 'Control de identidad' END,
               'text',  CASE WHEN c.lang='en' THEN 'Drivers take a selfie every time they connect, and it is recorded.'
                             ELSE 'El conductor se toma una selfie cada vez que se conecta y queda registrada.' END)
          ELSE f END ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(c.contentjson::jsonb->'features') WITH ORDINALITY e(f, ord)))::text,
    updatedat = now() AT TIME ZONE 'utc'
FROM landing.sections s
WHERE s.id = c.sectionid AND s.sectionkey = 'stats'
  AND jsonb_typeof(c.contentjson::jsonb->'features') = 'array';
