-- =====================================================================
-- Corrige descripciones viejas de la configuracion (landing.systemsettings)
-- y quita espacios sobrantes en los valores.
-- Idempotente: se puede ejecutar varias veces.
-- =====================================================================
BEGIN;

-- Valores con espacios (ej. ' -70.24...'): el panel los mostraba vacios.
UPDATE landing.systemsettings SET value = btrim(value) WHERE value <> btrim(value);

UPDATE landing.systemsettings SET description = 'Latitud del centro inicial de los mapas (ciudad principal).'
 WHERE settingkey = 'default_lat';
UPDATE landing.systemsettings SET description = 'Longitud del centro inicial de los mapas (ciudad principal).'
 WHERE settingkey = 'default_lng';
UPDATE landing.systemsettings SET description = 'Si esta activo, el sistema detecta cuando el conductor se sale de la ruta planificada, alerta en Monitoreo y avisa al pasajero.'
 WHERE settingkey = 'deviation_detection_enabled';

COMMIT;
