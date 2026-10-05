-- =====================================================================
-- Centro de avisos del panel admin + permisos propios por sección.
-- Idempotente: se puede ejecutar varias veces.
--
-- 1) Configuración de avisos en landing.SystemSettings (claves admin_notify_*
--    y doc_expiry_alert_days). Se editan desde Sistema > Avisos.
--    Valor de cada admin_notify_*: JSON con
--      enabled   true/false
--      color     primary | ok | warn | bad | info | neutral
--      duration  segundos en pantalla
--      (solo recordatorios periódicos)
--      onLogin   mostrar al iniciar sesión
--      mode      none | interval | fixed
--      everyHours  cada N horas (mode = interval)
--      times       horas fijas del día, hora Perú (mode = fixed)
-- 2) Permisos nuevos: se asignan a los roles que hoy tienen el permiso
--    que antes compartían esas páginas, para que nadie pierda acceso.
--    (super_admin no necesita filas: tiene todo el catálogo.)
-- =====================================================================
BEGIN;

-- ── 1. Configuración ─────────────────────────────────────────────────
INSERT INTO landing.SystemSettings (SettingKey, Value, Description) VALUES
 ('admin_notify_deviation',
  '{"enabled":true,"color":"bad","duration":6}',
  'Aviso en vivo: un conductor se desvió de la ruta (Monitoreo).'),
 ('admin_notify_contact_message',
  '{"enabled":true,"color":"info","duration":6}',
  'Aviso en vivo: llegó un mensaje de contacto nuevo.'),
 ('admin_notify_complaint',
  '{"enabled":true,"color":"warn","duration":6}',
  'Aviso en vivo: llegó una reclamación nueva (Libro de reclamaciones).'),
 ('admin_notify_driver_review',
  '{"enabled":true,"color":"primary","duration":6}',
  'Aviso en vivo: un conductor envió sus documentos a revisión.'),
 ('admin_notify_passenger_review',
  '{"enabled":true,"color":"primary","duration":6}',
  'Aviso en vivo: un pasajero subió su DNI y espera aprobación.'),
 ('admin_notify_document_expiring',
  '{"enabled":true,"color":"warn","duration":6,"onLogin":true,"mode":"interval","everyHours":6,"times":[]}',
  'Recordatorio: conductores con documentos por vencer. Al iniciar sesión y cada 6 horas.'),
 ('admin_notify_pending_messages',
  '{"enabled":true,"color":"info","duration":6,"onLogin":false,"mode":"fixed","everyHours":6,"times":["10:00","16:00"]}',
  'Recordatorio: mensajes de contacto sin responder. A las 10:00 y 16:00 (hora Perú).'),
 ('admin_notify_pending_complaints',
  '{"enabled":true,"color":"warn","duration":6,"onLogin":false,"mode":"fixed","everyHours":6,"times":["10:00","16:00"]}',
  'Recordatorio: reclamaciones sin atender. A las 10:00 y 16:00 (hora Perú).'),
 ('admin_notify_pending_registrations',
  '{"enabled":true,"color":"primary","duration":6,"onLogin":true,"mode":"interval","everyHours":4,"times":[]}',
  'Recordatorio: conductores y pasajeros por revisar. Al iniciar sesión y cada 4 horas.'),
 ('doc_expiry_alert_days',
  '6,3,0',
  'Días antes del vencimiento en que se avisa de un documento de conductor (correos y Centro de avisos). Ej: 6,3,0.')
ON CONFLICT (SettingKey) DO NOTHING;

-- ── 2. Permisos propios por sección ──────────────────────────────────
-- Configuración, Mensajes, Avisos, Reclamaciones y Empresa: antes view:landing.
INSERT INTO auth.RolePermissions (RoleId, Permission)
SELECT rp.RoleId, p.Permission
FROM auth.RolePermissions rp
CROSS JOIN (VALUES ('view:settings'), ('view:messages'), ('view:notifications_config'),
                   ('view:complaints'), ('view:company')) AS p(Permission)
WHERE rp.Permission = 'view:landing'
ON CONFLICT DO NOTHING;

-- Fidelización, Pagos a conductores y Comisiones: antes view:payments.
INSERT INTO auth.RolePermissions (RoleId, Permission)
SELECT rp.RoleId, p.Permission
FROM auth.RolePermissions rp
CROSS JOIN (VALUES ('view:rewards'), ('view:driver_payouts'), ('view:commissions')) AS p(Permission)
WHERE rp.Permission = 'view:payments'
ON CONFLICT DO NOTHING;

-- Verificación de conductores: antes view:drivers.
INSERT INTO auth.RolePermissions (RoleId, Permission)
SELECT rp.RoleId, 'view:verification'
FROM auth.RolePermissions rp
WHERE rp.Permission = 'view:drivers'
ON CONFLICT DO NOTHING;

COMMIT;
