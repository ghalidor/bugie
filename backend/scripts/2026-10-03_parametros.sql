-- =====================================================================
-- Auditoria de parametros (03/10/2026)
--
-- 1) landing.systemsettings: descripciones que dicen exactamente quien usa
--    cada valor (antes algunas prometian cosas que nadie leia).
-- 2) rewards.settings: crea las 3 claves de calificaciones. El motor ya las
--    lee (RewardsOptions) pero no existian en la base, asi que el panel las
--    mostraba bloqueadas con "Esta clave no existe en la base" y no se podian
--    editar. Se insertan con los mismos valores que el codigo usaba por defecto,
--    asi que el comportamiento no cambia.
--
-- Idempotente: se puede ejecutar varias veces. No borra filas.
-- =====================================================================
BEGIN;

-- ── 1) Descripciones de landing.systemsettings ──────────────────────────
UPDATE landing.systemsettings AS s SET description = d.txt
FROM (VALUES
  ('base_fare',                   'Tarifa minima en soles. Base de la tarifa sugerida al pedir un viaje (web y app).'),
  ('fare_per_km',                 'Soles por km. Tarifa sugerida = max(tarifa base, km x este valor). Web y app.'),
  ('platform_fee_rate',           'Comision de Bugie por viaje, EN PORCENTAJE (10 = 10%). Se calcula sobre lo que el pasajero pago de verdad.'),
  ('max_radius_km',               'Radio en km para avisar a conductores de un viaje nuevo y para listarles solicitudes cercanas.'),
  ('sos_response_min',            'Minutos objetivo de respuesta SOS. Se muestra en la pantalla SOS (web) y marca en el Centro SOS las alertas que lo superan.'),
  ('support_email',               'Correo de soporte. Se muestra en el panel de ayuda de la web y en Cuenta > Ayuda de la app.'),
  ('support_phone',               'Telefono de soporte. Se muestra en el panel de ayuda de la web y en Cuenta > Ayuda de la app.'),
  ('default_city',                'Ciudad principal de operacion. Aparece en los correos que envia la plataforma.'),
  ('default_lat',                 'Latitud del centro inicial de los mapas (panel, web y app).'),
  ('default_lng',                 'Longitud del centro inicial de los mapas (panel, web y app).'),
  ('default_zoom',                'Zoom inicial de los mapas (panel, web y app). 1 = mundo, 18 = calle.'),
  ('deviation_detection_enabled', 'Si esta activo, el sistema detecta cuando el conductor se sale de la ruta planificada, alerta en Monitoreo y avisa al pasajero.'),
  ('deviation_threshold_m',       'Distancia en metros a la ruta planificada a partir de la cual se considera desvio (por defecto 300).')
) AS d(k, txt)
WHERE s.settingkey = d.k AND s.description IS DISTINCT FROM d.txt;

-- ── 2) Claves de calificaciones en rewards.settings ─────────────────────
INSERT INTO rewards.settings (settingkey, value, description) VALUES
  ('rating_points_passenger',   '30',   'Puntos al pasajero por calificar al conductor. 0 lo desactiva'),
  ('rating_points_driver',      '50',   'Puntos al conductor cuando recibe 5 estrellas. 0 lo desactiva'),
  ('rating_require_five_stars', 'true', 'Si es true, el pasajero solo cobra cuando pone 5 estrellas')
ON CONFLICT (settingkey) DO NOTHING;

-- Descripcion engañosa: decia que apagado era "lo normal"; hoy es una opcion mas.
UPDATE rewards.settings
   SET description = 'Permite aplicar cupones de descuento al precio de un viaje. Apagado, los cupones se canjean pero no descuentan'
 WHERE settingkey = 'coupons_apply_to_fare'
   AND description IS DISTINCT FROM 'Permite aplicar cupones de descuento al precio de un viaje. Apagado, los cupones se canjean pero no descuentan';

COMMIT;
