# Base de prueba `bugie_test`

Datos de demo generados recorriendo los flujos reales por HTTP (registro, activacion,
viajes, pagos, puntos, canjes, cupones, sorteos y revision del admin).
Tu base `bugie` no se usa ni se modifica.

## Usuarios

**Contrasena de todos: `10203040`**

| Rol | Correo | Nombre | Estado |
|---|---|---|---|
| admin (super) | admin@bugie.pe | Administrador Bugie | activo |
| admin (rol soporte) | soporte@bugie.test | Soporte Bugie | activo |
| conductor | juan.pari@bugie.test | Juan Carlos Pari Vargas | aprobado, en linea, **con viaje EN CURSO** |
| conductor | miguel.cutipa@bugie.test | Miguel Angel Cutipa | aprobado, en linea (fue suspendido, pidio revision 2 veces y lo reactivaron: ver su linea de tiempo) |
| conductor | pedro.mendoza@bugie.test | Pedro Mendoza Calle | aprobado, en linea (referido de Lucia) |
| conductor | raul.ccama@bugie.test | Raul Ccama Limachi | en revision, SOAT rechazado |
| conductor | hugo.flores@bugie.test | Hugo Flores Quispe | **registro rechazado** (licencia sin categoria A-IIa) con **solicitud de revision ABIERTA** |
| pasajero | lucia.mamani@bugie.test | Lucia Mamani Quispe | verificado, mas viajes y puntos |
| pasajero | carlos.ticona@bugie.test | Carlos Ticona Flores | verificado (referido de Lucia), **viaje EN CURSO** |
| pasajero | maria.choque@bugie.test | Maria Fernanda Choque | verificado, tuvo un SOS, cambio su contrasena (y volvio a 10203040) |
| pasajero | jorge.apaza@bugie.test | Jorge Luis Apaza | verificado, **viaje PENDIENTE** buscando conductor |
| pasajero | rosa.condori@bugie.test | Rosa Elena Condori | verificado (se registro como "Condory" y el admin corrigio el apellido con motivo) |
| pasajero | diego.huanca@bugie.test | Diego Huanca Rivera | rechazado (DNI ilegible) |
| pasajero | ana.paredes@bugie.test | Ana Paredes Coaquira | pendiente de revision |
| pasajero | sofia.ramos@bugie.test | Sofia Ramos Ticona | **cuenta eliminada** por ella misma (no puede iniciar sesion; no se restaura) |

Documento: todos tienen DNI = `4` + los ultimos 7 digitos de su celular (el que sale en
la imagen del DNI). Admin principal: DNI `40000000`. Nombres y apellidos separados
(sin apellido materno: Maria Fernanda Choque, Jorge Luis Apaza, Rosa Elena Condori,
Miguel Angel Cutipa). Hugo: DNI `43200205`.

Ciudad: Tacna (es la `default_city` de la configuracion). Fechas repartidas en los ultimos 30 dias.

Ademas hay: viajes con "Ya llegue" (aviso del conductor), cancelaciones del conductor
y del pasajero con motivo, negociaciones cerradas al cancelar, pagos a conductores
(bonos por Yape/Plin, premio de sorteo por transferencia, un pago manual en efectivo)
y el recorrido GPS de cada viaje para verlo en el admin (Viajes > Ver detalle y recorrido).

- Conexiones: cada conductor aprobado tiene 4 conexiones cerradas con selfie (en dias en que
  tuvo viajes) y la conexion actual activa; Miguel tiene una mas por la reconexion tras su suspension.
- Estados del conductor: Miguel con historial de suspension (suspendido hasta hoy+3, revision,
  se mantiene, revision de nuevo, reactivado); Hugo rechazado con revision abierta (tarjeta en el admin).
- Bandeja de notificaciones: los push de los flujos quedan guardados; Lucia, Carlos, Maria, Juan y
  Pedro tienen la mitad mas antigua leida y el resto sin leer.
- Libro de Reclamaciones: 6 hojas: reclamo pendiente de Carlos enlazado a su viaje, queja pendiente,
  queja respondida, hoja anulada con motivo, posible bot descartado con motivo y posible bot sin resolver.
- Feriado extra "Feriado de prueba (decreto)" en un dia habil de la proxima semana (las fechas
  limite de las reclamaciones lo saltan). `01_limpiar_bugie_test.sql` borra los feriados extra.
- Cuentas: correccion de nombres por el admin (Rosa) y cuenta eliminada (Sofia) en la auditoria de cada cuenta.

Envios: 3 envios completos (fotos del paquete, recojo verificado, entrega con foto y quien recibio).

Imagenes: todas son reconocibles (avatar con iniciales, DNI y documentos con el nombre,
vehiculo con su placa, paquete, recojo y entrega). Las dibuja `generar_imagenes.ps1`
al inicio del seed (quedan en `logs/img/`). Las APIs las guardan en la carpeta de
`appsettings` (`LocalStorage:StoragePath`, hoy `C:/bugie-uploads`), la misma para las
6 APIs, y las sirven en `/uploads/...`.

Horas: la base guarda en UTC y las APIs devuelven hora de Peru (ver `BugieTime`).

## Como usarla

1. Levantar las 6 APIs contra `bugie_test` (no modifica ningun appsettings):
   ```bash
   bash scripts/test-data/levantar_apis_test.sh
   ```
   Desde Visual Studio: en cada API poner la variable de entorno
   `ConnectionStrings__Default=Host=localhost;Port=5432;Database=bugie_test;Username=postgres;Password=...`
2. Levantar admin / web / app como siempre.

## Regenerar desde cero

Se envian ~34 correos reales a ghaluix@gmail.com (bienvenidas, activaciones, rechazos de pasajero y de
conductor, cuenta eliminada, invitacion de referido, respuesta de contacto, pagos a conductores,
confirmacion y respuesta de 1 hoja del Libro de Reclamaciones y, por cada envio,
"recogimos tu paquete" y "tu envio fue entregado"). El resto de avisos va a correos @bugie.test.

```bash
# desde backend/
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS bugie_test WITH (FORCE)"
psql -U postgres -d postgres -c "CREATE DATABASE bugie_test"
psql -U postgres -d bugie_test -f backscript.sql
psql -U postgres -d bugie_test -f scripts/2026-10-02_correcciones.sql
psql -U postgres -d bugie_test -f scripts/2026-10-02_horas_a_utc.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_aprobacion_conductores.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_contacto_emergencia.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_desviaciones.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_billetera.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_descripciones_config.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_parametros.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_fotos_vehiculo.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_cobros_ranking.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_programados.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_reclamaciones.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_avisos_admin.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_reclamaciones_plazos.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_conexiones_conductor.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_rechazo_suspension.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_bandeja_notificaciones.sql
psql -U postgres -d bugie_test -f scripts/2026-10-03_documento_nombres_cuenta.sql
psql -U postgres -d bugie_test -f scripts/2026-10-04_avisos_admin_historial.sql
psql -U postgres -d bugie_test -f scripts/2026-10-04_sesiones.sql
psql -U postgres -d bugie_test -f scripts/2026-10-04_textos_seguridad_landing.sql
psql -U postgres -d bugie_test -f scripts/2026-10-04_landing_ciudad_configurable.sql
psql -U postgres -d bugie_test -f scripts/2026-10-04_aviso_sos_campana.sql
psql -U postgres -d bugie_test -f scripts/2026-10-04_beneficios_nivel_sorteos.sql
psql -U postgres -d bugie_test -f scripts/test-data/01_limpiar_bugie_test.sql
bash scripts/test-data/levantar_apis_test.sh        # en otra terminal
node scripts/test-data/seed.mjs
psql -U postgres -d bugie_test -f scripts/test-data/03_repartir_fechas.sql
```

## Archivos

| Archivo | Que hace |
|---|---|
| `01_limpiar_bugie_test.sql` | Borra datos transaccionales, deja la configuracion y el admin con `10203040` |
| `levantar_apis_test.sh` | Levanta las 6 APIs apuntando a `bugie_test` (logs en `logs/`) |
| `seed.mjs` | Genera todos los datos por HTTP; resultado en `logs/seed-resultado.json` |
| `generar_imagenes.ps1` | Dibuja las imagenes de prueba (lo llama `seed.mjs`; usa System.Drawing de Windows) |
| `03_repartir_fechas.sql` | Reparte las fechas en los ultimos 30 dias (ejecutar una vez tras el seed) |

## Permisos del panel admin en el backend

Las 6 APIs validan los permisos del rol con `[RequirePermission(...)]`
(`Bugie.<X>.Api/Security/RequirePermissionAttribute.cs`, mismo archivo en todas).
Varios codigos en un atributo = basta uno; varios atributos = todos. `super_admin`
pasa siempre. Sin permiso: `403 { error: "No tienes permiso para esta seccion." }`.
Si Auth no responde: `503` (nunca se concede por defecto). Las APIs que no son Auth piden
los permisos a `GET /api/internal/admins/{userId}/permissions` (X-Internal-Token) y los
guardan 45 s por usuario (`AdminPermissions:CacheSeconds`): un cambio de rol tarda hasta
eso en aplicarse fuera de Auth. Payments y Landing no tienen `Services:AuthApi` en su
appsettings: usan `http://localhost:5001` (en el servidor, definir `Services__AuthApi`).

| Permiso | Endpoints |
|---|---|
| view:users | `GET auth/users/paged`, `auth/users/stats`; roles `GET auth/admin/security/roles` (o view:security); crear admin y asignar rol (o view:security, ademas super_admin) |
| view:users / view:passengers / view:drivers (segun la cuenta) | `auth/admin/users/{id}` (detalle, auditoria, documento, nombres, restaurar), `PUT auth/users/{id}/deactivate`. Cuenta admin: solo view:users y, para modificar, super_admin. Nadie se desactiva a si mismo (409) |
| view:passengers | `auth/admin/passengers/*`, descarga de documentos de pasajero; aprobar/rechazar pasajero o su documento ademas **action:approve_passenger** |
| view:drivers | `drivers/paged` (o view:driver_payouts; `search` = nombre, correo, documento, celular o placa; cada fila trae `activePlate`), `drivers/stats`, `drivers/expiring-soon`, presencia, suspender / reactivar / mantener estado |
| view:drivers o view:verification | `drivers/pending`, `drivers/pending/paged`, `drivers/{id}/detail`, documentos (ver, historial, descargar, borrar), linea de tiempo, auditoria de aprobacion, fotos del vehiculo, `drivers/admin/notifications/summary`, calificaciones del conductor; aprobar/rechazar conductor o documento ademas **action:approve_driver** |
| view:live_map | `drivers/online`, `trips/live-passengers`, `trips/admin/deviations/active`; tambien SOS, revisar desvio, ubicacion y vehiculos de conductores |
| view:sos_center (o view:live_map) | `GET sos`, `PUT sos/{id}/resolve`, revisar desvio; `GET sos/admin/active` (con nombre y celular de quien activo y del otro participante) y `GET sos/admin/history` (resueltas: quien resolvio, motivo, duracion; `page`, `pageSize`, `from`, `to`, `search`) |
| view:trips | `trips/admin/paged`, `trips/admin/stats` (filtros `search` = direccion, pasajero o conductor por nombre/correo/documento/celular, o placa; `from`/`to` = dias de Peru; `passengerId`, `driverUserId`), `trips/incidents/counts` |
| view:trips o view:passengers | `trips/admin/by-passenger/{userId}` (viajes del pasajero, pestaña Viajes de su ficha) |
| view:trips o view:drivers | `trips/admin/by-driver/{userId}` (viajes del conductor por su UserId) |
| view:trips / view:live_map / view:complaints / view:sos_center / view:passengers / view:drivers / view:payments / view:commissions | detalle del viaje (`GET trips/{id}` (al admin con nombres de pasajero y conductor), fotos, incidencias, waypoints, ruta planificada, recorrido `drivers/admin/trips/{id}/path`, desvios del viaje) |
| view:payments | `payments/paged`, `payments/stats` (filtros `status`, `search` = nombre/correo/documento de pasajero o conductor, referencia o Id del viaje; `method`; `from`/`to`) |
| view:driver_payouts o view:rewards | `payments/admin/payouts/*` |
| view:commissions | `payments/admin/wallets/*` |
| view:reports | `trips/admin/reports/*` (ranking) |
| view:rewards | `rewards/admin/*` |
| view:landing + action:save_landing | `PUT landing/section` (salvo terms/privacy) |
| view:legal_docs + action:save_legal_docs | `PUT landing/section` con terms o privacy |
| view:community | `landing/news/paged`, `news/stats`; crear: **action:create_community**; editar: **action:edit_community** (solo **action:toggle_community** = publicar/ocultar sin cambiar contenido) |
| view:faq | `landing/faq/admin`, crear, editar, borrar, reordenar |
| view:messages | `landing/contact/*` (admin), `landing/admin/notifications/summary` |
| view:complaints | `landing/admin/complaints/*` (el listado acepta `from`/`to` = dias de registro) |
| view:company | `PUT landing/admin/company`, logo, settings `company_*` |
| view:settings | `PUT landing/settings/{key}` (tarifas, mapa, SOS, soporte, reclamaciones), feriados `landing/admin/holidays/*` |
| view:notifications_config | `PUT landing/settings/admin_notify_*` y `doc_expiry_alert_days` |
| view:security | catalogo y CRUD de roles (`auth/admin/security/*`, ademas super_admin) |
| view:users / view:passengers / view:drivers | avisos de un usuario `trips/admin/users/{id}/notifications`; contacto de emergencia (tambien view:sos_center) |
| (cualquier admin) | historial de avisos y `trips/admin/notifications/summary`: cada conteo sale `null` si falta el permiso de su seccion |

Endpoints mixtos (pasajero/conductor o admin: `GET trips/{id}`, propuestas, cancelar,
fotos, incidencias, calificaciones, detalle y ubicacion del conductor, `POST payments`):
el filtro solo se aplica a los admins (`SkipForNonAdmins`). Las llamadas entre modulos con
X-Internal-Token no pasan por el filtro.

Prueba rapida: entra al admin como `soporte@bugie.test` (dashboard, conductores,
pasajeros, viajes, SOS, pagos a conductores, aprobar conductor y pasajero) y como
`admin@bugie.pe` (todo). Con el token de soporte, `GET /api/auth/users/paged` o
`GET /api/payments/paged` deben dar 403; `GET /api/trips/admin/paged` 200.
