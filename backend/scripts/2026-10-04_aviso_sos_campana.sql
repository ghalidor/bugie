-- =====================================================================
-- Alertas SOS en la campana del admin (2026-10-04)
-- Cada SOS activado se guarda ahora en trips.adminnotifications con
-- type = 'sos', link /admin/sos y permission 'view:sos_center,view:live_map'
-- (basta tener uno de los dos). Esa tabla no necesita cambios.
-- Aqui solo se agrega la configuracion del aviso en el Centro de avisos
-- (Sistema > Avisos), para que se pueda cambiar su color/duracion:
-- sin esta fila, guardar la configuracion del SOS daria 404.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- =====================================================================

BEGIN;

INSERT INTO landing.SystemSettings (SettingKey, Value, Description) VALUES
 ('admin_notify_sos',
  '{"enabled":true,"color":"bad","duration":10}',
  'Aviso en vivo: un pasajero o conductor activo el boton SOS (Centro SOS).')
ON CONFLICT (SettingKey) DO NOTHING;

COMMIT;
