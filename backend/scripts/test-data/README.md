# Base de prueba `bugie_test`

Datos de demo generados recorriendo los flujos reales por HTTP (registro, activacion,
viajes con negociacion, pagos, puntos, canjes, cupones, sorteos y revision del admin).
Tu base `bugie` no se usa ni se modifica.

## Usuarios

**Contrasena de todos: `10203040`**

| Rol | Correo | Nombre | Estado |
|---|---|---|---|
| admin (super) | admin@bugie.pe | Administrador Bugie | activo |
| admin (rol soporte) | soporte@bugie.test | Soporte Bugie | activo |
| conductor | juan.pari@bugie.test | Juan Carlos Pari Vargas | aprobado, en linea, **con viaje EN CURSO** |
| conductor | miguel.cutipa@bugie.test | Miguel Angel Cutipa | aprobado, en linea (fue suspendido, pidio revision 2 veces y lo reactivaron: ver su linea de tiempo); tiene una oferta pendiente en el viaje que NEGOCIA Maria |
| conductor | pedro.mendoza@bugie.test | Pedro Mendoza Calle | aprobado, en linea (referido de Lucia); **programado de manana 10:00** asignado y una oferta pendiente en el viaje de Maria |
| conductor | raul.ccama@bugie.test | Raul Ccama Limachi | en revision, SOAT rechazado |
| conductor | hugo.flores@bugie.test | Hugo Flores Quispe | **registro rechazado** (licencia sin categoria A-IIa) con **solicitud de revision ABIERTA** |
| pasajero | lucia.mamani@bugie.test | Lucia Mamani Quispe | verificado, mas viajes y puntos, **nivel Plata** (uso su cupon de nivel y un ticket de sorteo); **programado manana 10:00 con conductor** (Pedro) |
| pasajero | carlos.ticona@bugie.test | Carlos Ticona Flores | verificado (referido de Lucia), **viaje EN CURSO** |
| pasajero | maria.choque@bugie.test | Maria Fernanda Choque | verificado, tuvo un SOS, cambio su contrasena (y volvio a 10203040), **viaje NEGOCIANDO con 2 ofertas** |
| pasajero | jorge.apaza@bugie.test | Jorge Luis Apaza | verificado, el admin desactivo y reactivo su cuenta (auditoria), **viaje PENDIENTE** buscando conductor |
| pasajero | rosa.condori@bugie.test | Rosa Elena Condori | verificado (se registro como "Condory" y el admin corrigio el apellido con motivo); **envio PROGRAMADO manana 15:00 SIN conductor** |
| pasajero | diego.huanca@bugie.test | Diego Huanca Rivera | rechazado (DNI ilegible) |
| pasajero | ana.paredes@bugie.test | Ana Paredes Coaquira | pendiente de revision |
| pasajero | sofia.ramos@bugie.test | Sofia Ramos Ticona | **cuenta eliminada** por ella misma (no puede iniciar sesion; no se restaura) |

Documento: todos tienen DNI = `4` + los ultimos 7 digitos de su celular (el que sale en
la imagen del DNI). Admin principal: DNI `40000000`. Nombres y apellidos separados
(sin apellido materno: Maria Fernanda Choque, Jorge Luis Apaza, Rosa Elena Condori,
Miguel Angel Cutipa). Hugo: DNI `43200205`.

Ciudad: Tacna (es la `default_city` de la configuracion). Fechas repartidas en los ultimos 30 dias.

Ademas hay: viajes con "Ya llegue" (aviso del conductor), cancelaciones del conductor,
del pasajero y **del sistema** (nadie tomo el pedido) con motivo, negociaciones cerradas al
cancelar, pagos a conductores (bonos por Yape/Plin, premio de sorteo por transferencia, un
pago manual en efectivo) y el recorrido GPS **por calles** de cada viaje para verlo en el
admin (Viajes > Ver detalle y recorrido).

- Rutas: GraphHopper local (`http://localhost:8989`, profile `car`). Para cada viaje
  completado el conductor manda su posicion desde donde estaba hasta el origen y luego a lo
  largo de la ruta origen -> destino, ~1 punto cada 80-120 m con `speedKmh` (~22 km/h) y
  `heading`, por `PUT /drivers/location`. Ese endpoint no acepta hora: `03_repartir_fechas.sql`
  reparte despues las horas de los puntos (ida entre la aceptacion y la llegada, viaje entre
  el inicio y el fin, por distancia recorrida) y da a cada viaje una duracion coherente con su
  recorrido. Si GraphHopper no responde, el seed usa una linea recta y lo deja como aviso.
- Conexiones: cada conductor aprobado tiene 4 conexiones cerradas con selfie (en dias en que
  tuvo viajes) y la conexion actual activa; Miguel tiene una mas por la reconexion tras su suspension.
- Estados del conductor: Miguel con historial de suspension (suspendido hasta hoy+3, revision,
  se mantiene, revision de nuevo, reactivado); Hugo rechazado con revision abierta (tarjeta en el admin).
- Bandeja de notificaciones: los push de los flujos quedan guardados (incluidos los nuevos de la
  negociacion: oferta retirada, conductor no confirmo, pedido cancelado por el sistema, programado
  reabierto); Lucia, Carlos, Maria, Juan y Pedro tienen la mitad mas antigua leida y el resto sin leer.
- Libro de Reclamaciones: 6 hojas: reclamo pendiente de Carlos enlazado a su viaje, queja pendiente,
  queja respondida, hoja anulada con motivo, posible bot descartado con motivo y posible bot sin resolver.
- Feriado extra "Feriado de prueba (decreto)" en un dia habil de la proxima semana (las fechas
  limite de las reclamaciones lo saltan). `01_limpiar_bugie_test.sql` borra los feriados extra.
- Cuentas: correccion de nombres por el admin (Rosa), desactivacion y reactivacion por el admin
  (Jorge) y cuenta eliminada (Sofia) en la auditoria de cada cuenta.
- Puntos: Lucia es nivel Plata (el admin le acredito un ajuste "bono de campaña" para llegar),
  reclamo el cupon de descuento de su nivel y lo uso en un viaje, canjeo "1 ticket extra de sorteo"
  y lo uso en el sorteo especial. Los 3 sorteos ya se sortearon ("Sortear ahora") y los premios
  estan entregados; `coupons_apply_to_fare` queda en `true`.

Envios: 3 envios completos (fotos del paquete, recojo verificado, entrega con foto y quien recibio)
y 1 envio programado sin conductor.

Imagenes: todas son reconocibles (avatar con iniciales, DNI y documentos con el nombre,
vehiculo con su placa, paquete, recojo y entrega). Las dibuja `generar_imagenes.ps1`
al inicio del seed (quedan en `logs/img/`). Las APIs las guardan en la carpeta de
`appsettings` (`LocalStorage:StoragePath`, hoy `C:/bugie-uploads`), la misma para las
6 APIs, y las sirven en `/uploads/...`. Al final el seed verifica por HTTP que cada usuario
tenga foto de perfil, cada conductor sus documentos, 3 fotos del vehiculo y sus selfies de
conexion, y cada envio sus fotos, y que cada URL responda 200 (las sensibles salen firmadas
en las respuestas del admin). Lo que falte sale como fail en el log.

Horas: la base guarda en UTC y las APIs devuelven hora de Peru (ver `BugieTime`).

## Lo que queda vivo para la demo (se crea al final del seed)

| Que | Quien | Nota |
|---|---|---|
| Viaje EN CURSO (conductor a mitad de la ruta) | Carlos -> Juan | plaza -> aeropuerto |
| Viaje NEGOCIANDO con 2 ofertas | Maria; ofertan Miguel y Pedro | **Bugie lo cancela a los 10 min** si nadie elige |
| Viaje PENDIENTE buscando conductor | Jorge | **Bugie lo cancela a los 10 min** (`trip_no_driver_cancel_min`) |
| Programado manana 10:00 CON conductor | Lucia -> Pedro | salio del escenario (i): Juan lo cancelo y se reabrio |
| Envio programado manana 15:00 SIN conductor | Rosa | se cancela solo al llegar su hora si nadie lo toma |

Los dos pedidos inmediatos (pendiente y negociando) viven 10 minutos desde que termina el seed:
si la demo es mas tarde, usa el simulador (abajo) o vuelve a pedir un viaje desde la web/app.

## Como usarla

1. Levantar las 6 APIs contra `bugie_test` (no modifica ningun appsettings):
   ```bash
   bash scripts/test-data/levantar_apis_test.sh
   ```
   Desde Visual Studio: en cada API poner la variable de entorno
   `ConnectionStrings__Default=Host=localhost;Port=5432;Database=bugie_test;Username=postgres;Password=...`
2. Levantar admin / web / app como siempre.

## Simulador para la demo de Monitoreo

`simular_viajes_en_curso.mjs` (con las APIs levantadas y la base ya sembrada) toma 2-3
conductores libres y pasajeros libres, crea viajes, los asigna (driver-accept ->
confirm-driver-acceptance), los pone en curso y mueve a cada conductor por su ruta de
GraphHopper **en tiempo real**: una posicion cada 3 s a ~22 km/h con `speedKmh` y `heading`.
Al llegar completa el viaje (el pasajero califica) y arranca otro desde donde quedo. Ademas,
cada ~4 min un pasajero libre crea un pedido que nadie toma, para que siempre haya alguien
"buscando conductor" (Bugie lo cancela a los 10 min).

```bash
node scripts/test-data/simular_viajes_en_curso.mjs 3      # 2 o 3 conductores
```

Variables opcionales: `GRAPHHOPPER_URL`, `TICK_MS` (3000), `SPEED_KMH` (22), `NUEVO_PEDIDO_MIN` (4).
Se detiene con **Ctrl+C** dejando todo coherente: lo que estaba en curso se completa (el
conductor "llega" al destino), lo aceptado sin iniciar lo cancela el conductor y los pedidos
pendientes los cancela su pasajero. Usa los usuarios de `logs/seed-resultado.json`; no toma
conductores ni pasajeros que ya tengan un viaje activo (por ejemplo el viaje EN CURSO del seed).

## Restaurar la base de prueba en otra PC (sin regenerar)

`backend/bugie_test_backup.sql` es un volcado completo (esquema + datos, 26 scripts ya aplicados,
particiones de GPS, recorridos consolidados, 979 viajes, 285 usuarios, carga del 6-oct-2026) hecho con
`pg_dump --clean --if-exists --no-owner`. Se restaura asi (PostgreSQL 18, usuario postgres):

```bash
# desde backend/
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS bugie_test WITH (FORCE)"
psql -U postgres -d postgres -c "CREATE DATABASE bugie_test"
psql -U postgres -d bugie_test -f bugie_test_backup.sql
```

Ademas de la base hacen falta, en la otra PC:
- Las imagenes: copiar la carpeta `C:/bugie-uploads` (1 010 archivos, ~63 MB, incluye gps-archive). Hay un zip fuera del repo en
  `D:\trabajo\jose\bugie_test_respaldo\bugie-uploads.zip`; descomprimirlo en `C:\bugie-uploads`.
  Sin ellas los registros existen pero las fotos salen rotas.
- GraphHopper local en `http://localhost:8989` con el mapa de la zona (lo usan Trips para las rutas,
  el seed y el simulador). Sin el, las rutas caen a linea recta.
- La contrasena de todos los usuarios de prueba sigue siendo la del seed (`PASSWORD`), incluidos los
  de carga `cargacNNNN@bugie.test` / `cargapNNNN@bugie.test`.
- Para la app en el celular: ajustar `bugie_app/.env` con la IP de la nueva PC (API_* y WEB_BASE_URL).
- El archivado a Parquet ya se corrio una vez (6-oct): la base trae solo 2 dias de GPS crudo y los
  dias anteriores estan en `C:/bugie-uploads/gps-archive` (dentro del zip). El job sigue corriendo
  solo a las 08:00 UTC (o con `POST /api/drivers/admin/gps-archive/run`).

## Regenerar desde cero

El seed tarda unos 15-20 minutos (manda ~3.000 posiciones GPS por calles y espera los
vencimientos de la negociacion). Requiere GraphHopper en `http://localhost:8989`.

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
psql -U postgres -d bugie_test -f scripts/2026-10-05_negociacion_viajes.sql
psql -U postgres -d bugie_test -f scripts/2026-10-06_indices_rendimiento.sql
psql -U postgres -d bugie_test -f scripts/2026-10-06_historial_gps.sql
psql -U postgres -d bugie_test -f scripts/2026-10-06_fechas_utc.sql
psql -U postgres -d bugie_test -f scripts/2026-10-07_alertas_monitoreo.sql
psql -U postgres -d bugie_test -f scripts/test-data/01_limpiar_bugie_test.sql
bash scripts/test-data/levantar_apis_test.sh        # en otra terminal
node scripts/test-data/seed.mjs
psql -U postgres -d bugie_test -f scripts/test-data/03_repartir_fechas.sql
node scripts/test-data/simular_viajes_en_curso.mjs  # opcional, para la demo de Monitoreo
```

### Orden de fases del seed

1. Imagenes -> Admin (rol soporte; verifica que `trip_no_driver_cancel_min`=10 y
   `driver_confirm_immediate_min`=2) -> Configuracion de rewards (cupones en tarifa, promociones, 3 sorteos).
2. Pasajeros y Conductores (registro, documentos, fotos, activacion, conexiones).
3. Viajes tanda 1 -> Canjes de puntos (+ Lucia: nivel Plata, cupon de nivel, ticket de sorteo) -> Viajes tanda 2 (con cupones).
4. **Negociacion** (escenarios a-f, i-l, abajo).
5. **Vencimientos** (g y h) corren **en paralelo** con Admin final (pagos, sorteos, reportes), Estados del
   conductor, Libro de Reclamaciones y Cuentas: bajan los plazos a 1 minuto por `PUT /landing/settings/{key}`,
   esperan al servicio de vencimientos de Trips y restauran 2 / 10 (y esperan 35 s por la cache de settings).
6. Estados finales para la demo -> Bandeja -> Verificacion de imagenes.

### Escenarios de negociacion (area `Negociacion` y `Vencimientos` en `logs/seed-resultado.json`)

| Paso en el log | Que prueba |
|---|---|
| `a) pasajero elige a D1 entre dos que aceptaron su precio` | driver-accept x2 -> confirm-driver-acceptance; la otra aceptacion queda `rejected` |
| `b) conductor acepta la contraoferta del pasajero` | propose -> counter -> accept-counter; el viaje queda al monto de la contraoferta |
| `c) crear viaje bajo base_fare -> 400`, `c) proponer 0 / negativo / 10x la tarifa -> 400`, `c) contraoferta fuera de rango / 0 -> 400` | rango base_fare .. suggestedFare x fare_max_multiplier |
| `d) dos confirmaciones a la vez: una 200 y otra 409` | `Promise.all` de dos confirm-driver-acceptance; el viaje queda con un solo conductor y una sola propuesta `accepted` |
| `e) acepta a D1, deshace y acepta a D2` | accept-proposal (409 si intenta una segunda) -> cancel-acceptance (registro de auditoria) -> accept-proposal -> confirm-acceptance |
| `f) conductor retira su oferta ya aceptada; el pasajero elige a otro` | decline-by-driver sobre `accepted_by_passenger`; aviso `offer_withdrawn` en la bandeja del pasajero |
| `k) conductor en viaje en curso no puede aceptar ni ofertar en otro (409)` | driver-accept y propose con viaje activo |
| `l) reject-all con 2 ofertas`, `l) rechazar una aceptacion a tarifa (driver_accepted)` | reject-all (affected 2) y reject de una `driver_accepted` (segundo rechazo 400) |
| `i) programado cancelado por el conductor antes de la hora -> reabierto`, `i) otro conductor (D3) toma el programado reabierto` | cancel del conductor devuelve el viaje con status 1, sin conductor y programado; aviso `trip_reopened` (push; el backend no envia correo) |
| `j) programado con conductor que no llego: el pasajero republica` | hora programada movida al pasado en BD -> `driverLate` -> republish -> otro conductor lo toma y lo completa |
| `g) la oferta vence por falta de confirmacion`, `g) confirmar despues del plazo -> 409` | `driver_confirm_immediate_min`=1; propuesta `rejected / driver_no_confirm`; aviso `driver_no_confirm` al pasajero |
| `h) viaje sin ofertas cancelado por el sistema` | `trip_no_driver_cancel_min`=1; `cancelledBy=system`, aviso con `reason_code=no_driver_timeout` |

Los viajes de los escenarios (salvo i) terminan completados con su recorrido GPS, asi que
tambien suman a los viajes, pagos y puntos.

### Correos reales

Se envian como maximo 50 correos reales (estimado ~47) a `ghaluix@gmail.com`. Como
`auth.users.email` es UNIQUE, cada usuario usa un alias `ghaluix+<clave>@gmail.com`
(Gmail lo entrega en la misma bandeja) mientras dura la fase en la que recibe correo; al
terminar la fase el seed espera 10 s y le devuelve su `@bugie.test`. Al llegar a 48 las fases
siguientes van a `@bugie.test`. El total real sale al final del seed y en `logs/seed-resultado.json` (`correos`).

| Fase | Correos |
|---|---|
| Pasajeros | 8 bienvenidas, 5 "cuenta activa", 1 rechazo, 1 cuenta eliminada |
| Conductores | 5 bienvenidas, 3 "cuenta activa" |
| Viajes (envios) | por cada envio completado: "recogimos tu paquete" y "tu envio fue entregado" (3 envios = 6) |
| Admin final | 3 bonos pagados, 1 pago manual, 1 premio pagado, ganadores de los 3 sorteos (hasta 4), invitacion de referido, respuesta de contacto |
| Estados del conductor | Miguel: suspension, revision mantenida, reactivacion; Hugo: registro rechazado |
| Libro | confirmacion + respuesta de la queja respondida |
| Cuentas | Maria: constancia de cambio de contrasena (ida y vuelta) |

Desactivar / reactivar una cuenta (Jorge) y reabrir un programado (Lucia) **no envian correo**:
el backend solo manda push y auditoria.

## Archivos

| Archivo | Que hace |
|---|---|
| `01_limpiar_bugie_test.sql` | Borra datos transaccionales, deja la configuracion y el admin con `10203040` |
| `levantar_apis_test.sh` | Levanta las 6 APIs apuntando a `bugie_test` (logs en `logs/`) |
| `seed.mjs` | Genera todos los datos por HTTP; resultado en `logs/seed-resultado.json` |
| `generar_imagenes.ps1` | Dibuja las imagenes de prueba (lo llama `seed.mjs`; usa System.Drawing de Windows) |
| `03_repartir_fechas.sql` | Reparte las fechas en los ultimos 30 dias y las horas del recorrido GPS (ejecutar una vez tras el seed) |
| `simular_viajes_en_curso.mjs` | Simulador en tiempo real para la demo de Monitoreo (conductores moviendose por calles) |

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
| view:users / view:passengers / view:drivers (segun la cuenta) | `auth/admin/users/{id}` (detalle, auditoria, documento, nombres, restaurar), `PUT auth/users/{id}/deactivate` y `/reactivate`. Cuenta admin: solo view:users y, para modificar, super_admin. Nadie se desactiva a si mismo (409) |
| view:passengers | `auth/admin/passengers/*`, descarga de documentos de pasajero; aprobar/rechazar pasajero o su documento ademas **action:approve_passenger** |
| view:drivers | `drivers/paged` (o view:driver_payouts; `search` = nombre, correo, documento, celular o placa; cada fila trae `activePlate`), `drivers/stats`, `drivers/expiring-soon`, presencia, suspender / reactivar / mantener estado |
| view:drivers o view:verification | `drivers/pending`, `drivers/pending/paged`, `drivers/{id}/detail`, documentos (ver, historial, descargar, borrar), linea de tiempo, auditoria de aprobacion, fotos del vehiculo, `drivers/admin/notifications/summary`, calificaciones del conductor; aprobar/rechazar conductor o documento ademas **action:approve_driver** |
| view:live_map | `drivers/online`, `trips/live-passengers`, `trips/admin/deviations/active`; tambien SOS, revisar desvio, ubicacion y vehiculos de conductores |
| view:sos_center (o view:live_map) | `GET sos`, `PUT sos/{id}/resolve`, revisar desvio; `GET sos/admin/active` (con nombre y celular de quien activo y del otro participante) y `GET sos/admin/history` (resueltas: quien resolvio, motivo, duracion; `page`, `pageSize`, `from`, `to`, `search`) |
| view:trips | `trips/admin/paged`, `trips/admin/stats` (filtros `search` = direccion, pasajero o conductor por nombre/correo/documento/celular, o placa; `from`/`to` = dias de Peru; `passengerId`, `driverUserId`), `trips/incidents/counts` |
| view:trips o view:passengers | `trips/admin/by-passenger/{userId}` (viajes del pasajero, pestaña Viajes de su ficha) |
| view:trips o view:drivers | `trips/admin/by-driver/{userId}` (viajes del conductor por su UserId) |
| view:trips / view:live_map / view:complaints / view:sos_center / view:passengers / view:drivers / view:payments / view:commissions | detalle del viaje (`GET trips/{id}` (al admin con nombres de pasajero y conductor), fotos, incidencias, waypoints, ruta planificada, recorrido `drivers/admin/trips/{id}/path` y crudo `drivers/admin/trips/{id}/path/raw`, desvios del viaje) |
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
| view:settings | `PUT landing/settings/{key}` (tarifas, mapa, SOS, soporte, reclamaciones, negociacion: `fare_max_multiplier`, `trip_no_driver_cancel_min`, `driver_confirm_immediate_min`, `driver_confirm_scheduled_before_min`), feriados `landing/admin/holidays/*`, historial GPS `drivers/admin/gps-archive` (GET estado, POST run) |
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

## Historial GPS (particiones, recorridos consolidados y Parquet)

Script: `scripts/2026-10-06_historial_gps.sql`. Codigo: Drivers.Api (`GpsArchiveService`, `GpsArchiveJobService`,
`TripPathReadService`, `ParquetGpsArchiveStore`). Paquete NuGet `Parquet.Net` 5.4.0 en Bugie.Drivers.Infrastructure.

- `drivers.locationhistory` esta **particionada por dia UTC** (`locationhistory_YYYYMMDD`, PK `(id, recordedat)`,
  indices `ix_locationhistory_trip_recorded` y `ix_locationhistory_driver_recorded` heredados por particion) mas una
  particion `locationhistory_default` de seguridad. `drivers.ensure_locationhistory_partitions(n)` crea hoy + n dias
  (la API lo hace al arrancar y en el job).
- `drivers.trippaths`: una fila por viaje terminado (polilinea `points` factor 1e6 + `details` jsonb con tiempos,
  velocidades y rumbos). `drivers.consolidate_trip_path(tripid)` la arma desde el crudo. Trips avisa al completar o
  cancelar en curso (`POST drivers/internal/trips/{id}/consolidate-path`, X-Internal-Token; Drivers espera
  `GpsArchive:ConsolidateDelaySeconds` = 30 s para que entren los ultimos puntos). Si no llega el aviso, el job
  consolida todo viaje sin GPS nuevo en `ConsolidateAfterHours` = 6 h.
- Lectura (`drivers/admin/trips/{id}/path`, `drivers/me/trips/{id}/path`, `drivers/internal/trips/{id}/path`):
  primero `trippaths`; si no existe (viaje en curso o recien terminado), el crudo como antes. Misma respuesta.
- Job nocturno (`GpsArchive:RunAtHourUtc` = 8 -> 3 am Peru): particiones, consolidacion y exporta cada particion de
  hace `KeepDays` (2) dias o mas a `{GpsArchive:Folder}/locationhistory_YYYY-MM-DD.parquet`
  (default `C:/bugie-uploads/gps-archive`); borra la particion **solo** si el archivo tiene la misma cantidad de filas.
  A mano: `POST drivers/admin/gps-archive/run` (view:settings); estado y archivos: `GET drivers/admin/gps-archive`.
- Crudo de un viaje ya archivado: `GET drivers/admin/trips/{id}/path/raw` (lee los Parquet de los dias del viaje).
- Al limpiar bugie_test (`01_limpiar_bugie_test.sql`) o repartir fechas (`03_repartir_fechas.sql`), las filas
  caen en la particion de su dia o en `locationhistory_default` si no existe; `trippaths` se rearma con el job o
  con `SELECT drivers.consolidate_trip_path(id)`.
