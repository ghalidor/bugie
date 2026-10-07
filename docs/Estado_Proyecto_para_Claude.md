# Bugie: estado del proyecto (traspaso para otra sesión de Claude)

Actualizado: 6 de octubre de 2026. Léelo completo antes de tocar nada. Complementa a `CLAUDE.md`, `docs/Bugie_Acta_Inicio_Proyecto.md` y `docs/Player_Tracking_Bugie.md`.

---

## 1. Reglas del dueño (obligatorias)

1. **No hacer nada por cuenta propia.** Primero explicar qué se hará y esperar a que diga **"empieza"**. Si pregunta algo, se responde; no se interpreta como permiso para cambiar código.
2. **Nunca hacer commits** (los hace él).
3. Responder siempre en **español** (Perú, tuteo en los textos de usuario).
4. **No inventar.** Si algo no está en el código o en los docs, decirlo. Los docs de `/docs` son referencia; la verdad es el código.
5. **Cuando pide cambios visuales, no tocar la lógica.** (Se quejó cuando se "mejoraron" pantallas cambiando comportamiento.)
6. **Mantener las ruedas giratorias** de carga (no reemplazarlas por skeletons).
7. **Nada de lógica solo para pruebas dentro del código del proyecto.** El proyecto está casi en producción y corre solo con su configuración. Las pruebas se manejan por fuera (scripts en el scratchpad, datos en `bugie_test`).
8. **Landing pública:** no agregar ni cambiar secciones visibles sin que las acepte. Sí acepta mejoras que se acoplan sin modificar lo existente (aceptó: botón flotante de WhatsApp, buscador de Preguntas frecuentes y SEO). Rechazó y se quitaron: "Descarga de la app con QR" y "Seguridad verificable".
9. Nombres: **"Solicitudes"**, no "Pedidos". Sin calculadora de tarifa. Sin rate limiting.
10. Al compilar, mostrarle **solo los errores**.
11. Pedir confirmación antes de cualquier cosa destructiva o remota.

## 2. Datos, pruebas y entorno

- **Repo:** `D:\trabajo\jose\bugie_git\bugie`. Existe una copia vieja en `D:\trabajo\jose\bugie`: **no tocarla**.
- **Base de datos de prueba:** `bugie_test` (PostgreSQL 18, `C:/Program Files/PostgreSQL/18/bin/psql.exe`, usuario `postgres`; la clave está en los `appsettings`). Usar `PGCLIENTENCODING=UTF8`.
- **Nunca leer ni modificar la base real `bugie`.**
- `bugie_test` es la **base de demostración**: no limpiarla al terminar una prueba. Solo restaurarla si el dueño pide una prueba nueva desde cero.
- Contraseña de todos los usuarios de prueba: la de `backend/scripts/test-data/seed.mjs` (`PASSWORD`).
- **Correos en pruebas:** se usan las credenciales reales (SMTP, Firebase) tal como están. Para crear una cuenta nueva de prueba: registrarla con `ghaluix@gmail.com` (para que el correo llegue de verdad) y después cambiar en la BD su correo a uno `@bugie.test`, como hace `seed.mjs` con `REAL_EMAIL`. **Nunca registrar directo con un correo inventado** (manda correos a destinatarios inexistentes; el dueño se quejó).
- **Imágenes:** una sola carpeta `C:/bugie-uploads` para todas las APIs (también en pruebas).
- **Antes de levantar APIs,** verificar que los puertos 5001-5006 estén libres: el dueño suele tener sus APIs corriendo desde Visual Studio (y no se sabe a qué BD apuntan). No matar sus procesos ni su servidor del admin. Si sus APIs están corriendo, compilar con `dotnet build <proyecto> -p:OutDir=<carpeta temporal>` para no chocar con DLL bloqueadas.
- **Levantar APIs de prueba contra `bugie_test`:** `bash backend/scripts/test-data/levantar_apis_test.sh` (logs en `backend/scripts/test-data/logs/`). Al terminar, cerrarlas.
- **Regenerar datos de prueba:** ver `backend/scripts/test-data/README.md` (orden de scripts, `seed.mjs`, `03_repartir_fechas.sql`).
- **Codificación:** varios `.cs` están en latin1 (Windows-1252), por ejemplo `Trip.cs`, `CreateTripHandler.cs`, `TripProposalRepository.cs`, `IUserRepository.cs`, `ActivateSosHandler.cs`, `SosController.cs`, `ApproveDriverHandler.cs`, `Driver.cs`, `IPaymentRepository.cs`, `DriverDtos.cs`. Revisar con `file` y editarlos byte a byte en latin1, sin convertir. Conservar CRLF/LF (ojo: `sed` en Git Bash puede cambiar los finales de línea).
- **Credenciales versionadas:** hay archivos de Firebase/Google y claves en `appsettings` dentro de git. El dueño debe rotarlas y sacarlas; no copiarlas a otros archivos.

## 3. Arquitectura

| Pieza | Ruta | Puerto |
|---|---|---|
| Auth API | `backend/Auth` | 5001 |
| Trips API (viajes, envíos, SOS, monitoreo SignalR) | `backend/Trips` | 5002 |
| Drivers API | `backend/Drivers` | 5003 |
| Payments API | `backend/Payments` | 5004 |
| Landing API (CMS, contacto, Libro de Reclamaciones, ajustes) | `backend/Landing` | 5005 |
| Rewards API (puntos, Fase 2) | `backend/Rewards` | 5006 |
| Web pasajero/conductor + landing | `frontend/bugie-web` (React + Vite) | 5173 |
| Admin | `frontend/bugie-admin` (React + Vite) | 5174 |
| App móvil | `bugie_app` (Flutter, go_router, flutter_map, FCM) | — |

- Backend .NET 8, Onion, MediatR, **Dapper** (no EF), PostgreSQL. En Auth los validadores FluentValidation no corren solos: se valida en los handlers.
- Comunicación entre APIs por HTTP con la dirección en `appsettings` (`Services:AuthApi`, `Services:TripsApi`, etc.) y el header `X-Internal-Token` (comparado con `FixedTimeEquals`).
- **Permisos del admin:** atributo `[RequirePermission]` (archivo idéntico en las 6 APIs); Auth expone `GET /api/internal/admins/{id}/permissions` (caché 45 s). Tabla de permisos en `backend/scripts/test-data/README.md`.
- **Sesiones:** `SecurityStamp` + claim `sst` en el JWT; `SessionState.cs` en las 6 APIs (caché 30 s). Cambiar contraseña, cerrar sesiones o desactivar invalida los tokens viejos.
- **Errores:** `ExceptionMiddleware` global en todas las APIs (sin detalles internos); JSON mal formado responde genérico (`AllowInputFormatterExceptionMessages = false`).
- **Archivos sensibles:** URLs firmadas HMAC (`?exp&sig`, `SignedUploads.cs`); validación de tipo real del archivo (magic bytes). La foto de perfil es pública a propósito.
- **Push:** FCM con canales `bugie_requests` y `bugie_high_priority`; la clave reservada `from` se renombra a `from_role` (`FcmSender.SafeKey`).
- **Admin UI kit:** `frontend/bugie-admin/src/components/ui` (Page, SectionCard, DataTable, Modal/Drawer, useConfirm, Select, Field/FormGrid, StatusBadge, Tour, etc.). Toda acción que cambia datos lleva modal de confirmación.
- **Ciudad:** la empresa es de Trujillo pero el sistema es portable. Los textos usan `{city}` / `{cityCountry}` y se rellenan con la ciudad configurada (`default_city`); en `bugie_test` está Tacna.

## 4. Flujo de un viaje o envío (resumen)

Documento visual: `docs/Flujo_Viaje_Bugie.html`.

1. El pasajero pide viaje o envío → **Pendiente (1)**; push a conductores dentro del radio.
2. Camino A: el conductor acepta la tarifa; varios pueden aceptar y el pasajero elige. Camino B: el conductor propone otra tarifa (**Negociando, 7**), el pasajero acepta y el conductor confirma ("Confirmar viaje").
3. **Aceptado (2)** → "Ya llegué" → (envío: verificación del recojo con fotos, obligatoria) → **En curso (3)** → (envío: confirmación de entrega con foto y nombre) → **Completado (4)**: se crea el pago con la tarifa acordada (cupón ya descontado), se registra la comisión y se califica.
4. Cancelado (5): pasajero mientras no termine; conductor solo aceptado y antes de iniciar. Programados: si el conductor no marca "Ya llegué" a los 15 min de la hora, vuelve a Pendiente.
5. SOS (pasajero o conductor, en curso): alerta al centro de monitoreo y a los admins (mapa, Centro SOS, campanita) + correo al contacto de emergencia. Lo de la Policía lo hacen los admins a mano; el sistema no se conecta con la Policía. No hay reconocimiento facial: el conductor se toma una selfie que queda registrada cada vez que se conecta.

## 5. Puntos, promociones y sorteos (Fase 2, ya implementado)

Documento visual: `docs/Puntos_Promociones_Sorteos_Bugie.html`. Valores por defecto en `rewards.settings` (editables en Admin › Fidelización › Ajustes).

- Pasajero: 10 pts por S/ 1, 30 por calificar con 5★, racha 150, meta semanal (apagada), aniversario ×3, referidos.
- Conductor: 5 pts por S/ 1, 50 por recibir 5★, 100 por día sin cancelar (≥3 viajes), racha, meta semanal 50 servicios = 200.
- Niveles por puntos históricos: Bronce 0, Plata 5000, Oro 15000, Platino 40000.
- **Beneficios de nivel (pasajero), nuevo:** cupones de descuento al mes (Bronce 1×5 %, Plata 2×10 %, Oro 3×15 %, Platino 4×25 %) y viajes gratis al mes con tope (Oro 1 hasta S/ 15, Platino 3 hasta S/ 25). Se reclaman en Mis puntos ("Reclamar cupón"), generan un cupón `BG-…`, el cupo se renueva el día 1 y vencen a fin de mes. Aviso por push al subir de nivel y al inicio de mes. Requiere el interruptor `coupons_apply_to_fare` prendido.
- **Cupón de ticket de sorteo, nuevo:** el ítem del catálogo genera un cupón que se usa en el sorteo que el usuario elija ("Usar mi cupón de ticket").
- **Aviso al ganador de un sorteo, nuevo:** push + correo con el código `PZ-…`.
- Cupones de viaje: se aplican con "Usar un cupón" en un viaje aceptado o en curso y se consumen al completar.
- El admin paga bonos y premios de conductores en Pagos a conductores › "Cobrar con código".
- Pendiente conocido: el cupón de catálogo de 10 % "durante 30 días" se gasta en un solo viaje; las promociones de tipo descuento/viaje gratis no se pueden crear (las promociones solo dan puntos).

## 6. Trabajo de las últimas sesiones (todo sin commit salvo lo que el dueño ya commiteó)

**Seguridad (probado en vivo):** registro solo como pasajero/conductor; endpoints internos con token; datos del conductor solo para admin/él mismo; `nearby` requiere sesión; ubicación del conductor solo para admin/él/pasajero de su viaje; controles IDOR en propuestas, incidencias, calificaciones y SOS; solo conductores aprobados proponen; Swagger sin token precargado.

**Sesiones y errores (probado en vivo):** cambiar contraseña devuelve token nuevo y cierra las demás sesiones; admin puede cerrar sesiones, desactivar y reactivar cuentas (`PUT /auth/users/{id}/reactivate`, `POST /auth/admin/users/{id}/revoke-sessions`); errores sin detalles internos.

**Admin (probado en vivo):** enlaces entre viajes, pasajeros, conductores y pagos; pestaña Viajes en las fichas; Centro SOS con nombre/celular e historial; búsquedas por pasajero, conductor, placa y fechas; exportar CSV (viajes, pasajeros, conductores, pagos, Libro de Reclamaciones); "Sin datos" cuando falla una API; confirmaciones nuevas (aprobar, configuración con antes→después y "última modificación", feriados, comunidad, promociones, permisos, pagos); tours actualizados y nuevos; SOS en la campanita; botón "Centrar en el viaje" en el detalle del viaje; en Monitoreo, "Ver viaje" de desvíos/SOS de viajes terminados abre el detalle completo, etiqueta "Viaje terminado" y tiempos en h/días.

**Web pasajero/conductor:** transiciones entre páginas, números que suben, marcador del conductor que se mueve suave en el seguimiento, línea de tiempo del viaje, ofertas animadas. El SOS de la web es un botón normal con su confirmación (se probó "mantener presionado" y el dueño pidió quitarlo).

**Landing:** SEO (título/descripción por página, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml`), botón flotante de WhatsApp (usa `support_phone`; con un fijo solo llama), buscador en Preguntas frecuentes con enlace por pregunta, textos de Seguridad corregidos (sin reconocimiento facial ni Policía), mapa de Seguridad centrado en la ubicación configurada, textos del CMS con `{city}`.

**App Flutter (sesiones anteriores, probado en el celular del dueño vía adb):** solicitudes ordenadas, pestaña "Solicitudes", marcador "Tú" con radar, bandeja de notificaciones que descuenta al leer, SOS grande en el viaje, franja "Viaje en curso · Volver", corrección de FCM, "Confirmar viaje" visible para el conductor; pantallas de beneficios de nivel y cupón de ticket (nuevas, sin probar en el celular).

**Puntos:** beneficios de nivel con cupones, cupón de ticket de sorteo, aviso al ganador (push + correo); pantallas en web, app y admin. Probado en vivo por el seed (cupón de nivel usado en viaje, ticket usado en sorteo, 3 sorteos ejecutados con correo al ganador).

**Negociación (5-oct, probado en vivo):** rango de precio (base_fare .. suggestedFare × fare_max_multiplier), viaje inmediato sin ofertas se cancela a los `trip_no_driver_cancel_min` (10), confirmación del conductor vence a `driver_confirm_immediate_min` (2) / `driver_confirm_scheduled_before_min` (60), programado cancelado por el conductor se reabre, `PUT /trips/{id}/accept` eliminado, `POST /trips/{id}/accept-counter/{proposalId}` nuevo, asignación con UPDATE condicionado (dos confirmaciones a la vez → una 200 y otra 409; se corrigió un deadlock bloqueando primero el viaje), avisos corregidos. Web y app comparten la misma tabla estado→botones→textos (spec en la sesión; textos idénticos verificados). Admin › Configuración tiene la sección "Negociación de viajes".

**Tiempo real (5-oct, probado en vivo):** hub SignalR `/hubs/trips` en Trips (grupos user:{id}, trip:{id}, drivers:requests; eventos TripChanged, ProposalsChanged, DriverLocation, RequestsChanged, UserNotification = espejo de cada push). Web (@microsoft/signalr) y app (signalr_netcore) conectadas; polling de respaldo 30 s; FCM se mantiene en la app. Monitoreo del admin dibuja el trazo en vivo de cada unidad (capa "Recorridos") y los pines se mueven suave.

**Datos de prueba (5-oct):** `backend/scripts/test-data/seed.mjs` reescrito: rutas reales por calles con GraphHopper local (http://localhost:8989) y GPS con horas coherentes, 12 escenarios de negociación (a–l) con asserts, correos reales ≤ 50 con alias `ghaluix+clave@gmail.com` por fase (misma bandeja), verificación de imágenes (117 URLs), demo final (programados, en curso, negociando, pendiente). `simular_viajes_en_curso.mjs` mueve unidades en vivo para la demo de Monitoreo (ver README de test-data). Corrida del 5-oct: 242 OK, 48 correos, 6,6 min.

## 6b. Sesión del 6-oct-2026 (rendimiento, historial GPS, pruebas en celular, carga)

**Posiciones GPS (Drivers + Trips, probado en vivo):** `PUT /api/drivers/location/batch` (hasta 50 puntos, `recordedAt` hora Perú) además del de 1 punto; filtro en servidor (descarta < 15 m y < 3 s, desordenados, futuros > 2 min, > 1 h); cola interna `System.Threading.Channels` (50 000, DropOldest) + `LocationWriterService` que escribe por lotes (1 UPDATE y 1 INSERT por lote, hasta 500 puntos o cada 1 s); posición en vivo en memoria (`DriverLiveLocations`) que usan `nearby`, `/online` (mapa admin) y `by-user/{id}/location`; aviso a Trips en segundo plano (`POST /api/internal/notify/driver-locations`); en Trips el viaje activo del conductor se cachea 30 s y el desvío se revisa cada ≥ 50 m / 15 s. Settings `Location:*` (Drivers) y `LocationRelay:*` (Trips) con defaults en código. Métricas en el log de Drivers cada 60 s ("GPS ultimo periodo: ..."). Índices: `2026-10-06_indices_rendimiento.sql`. La app manda lotes cada 12 s o 5 puntos, con cola local (500) y reintento sin red; `flush()` antes de completar/cancelar/desconectar/cerrar sesión.

**Historial GPS (Drivers, probado en vivo):** `drivers.locationhistory` particionada por día UTC (`ensure_locationhistory_partitions`), `drivers.trippaths` con el recorrido consolidado por viaje (polilínea + tiempos/velocidades/rumbos comprimidos; se consolida 30 s después de completar, vía `POST /api/drivers/internal/trips/{id}/consolidate-path`, y el job nocturno repasa); `/path` lee primero trippaths y si no hay, el crudo; `/path/raw` lee del Parquet si ya se archivó. Job `GpsArchiveJobService` (08:00 UTC): particiones +3 días, consolidación, exporta particiones de hace ≥ `KeepDays` (2) a `C:/bugie-uploads/gps-archive/locationhistory_YYYY-MM-DD.parquet` (Parquet.Net 5.4.0, Zstd) y recién entonces borra la partición. Admin: `POST /api/drivers/admin/gps-archive/run`, `GET /api/drivers/admin/gps-archive`. Script `2026-10-06_historial_gps.sql`. Corrido a mano el 6-oct: 24 archivos Parquet (2 869 filas, 152 KB) y la base quedó con 2 días de crudo; viajes antiguos verificados: `/path` desde trippaths y `/path/raw` desde el Parquet.

**Pruebas en el celular (Samsung, adb, 53 min, 15 escenarios):** 13 OK con capturas, 1 falla (el detalle de la solicitud del conductor no reacciona cuando el pasajero cancela y la oferta está pendiente), 1 no probable (cupón de ticket: no había sorteo abierto). Textos de la negociación verificados idénticos a la web. Observaciones de UX en la lista de pendientes.

**Prueba de carga (`scripts/test-data/prueba_carga.mjs`, 60 conductores en viaje + 150 conectados, 7 min):** 650 viajes, 0 fallidos, 26 230 peticiones, 0 errores, cola GPS siempre vacía. Hallazgo 1: con `Services:*Api = http://localhost:...` había esperas de 1,5-4 s (intento IPv6 previo de Windows); con `127.0.0.1` el p95 bajó a 7-73 ms (A/B hecho; `levantar_apis_test.sh` ya exporta `Services__*` con 127.0.0.1). Hallazgo 2: PostgreSQL `max_connections=100` se superó en un pico (Auth recibió 2 × "53300 demasiados clientes"); Auth en reposo responde en 1-3 ms. Las cuentas de carga (`cargac0000…`, `cargap0000…`) se crean directo en BD sin correos; `--no-register` las reutiliza. Resultado en `scripts/test-data/logs/carga-resultado.json`.

**Correcciones del 6-oct (tarde), compiladas y con pruebas HTTP en verde:**
- App: el detalle de la solicitud del conductor ahora reacciona a la cancelación / toma por otro / vencimiento (diálogo "El pasajero canceló esta solicitud." / "Otro conductor tomó este viaje." / "Esta solicitud venció." y vuelve; la lista Solicitudes quita la tarjeta al instante); "al pasajero"; cupón de nivel "X% de descuento hasta el {fecha}"; chips sin cortar (Wrap / 2 líneas) en ofertas del pasajero, Mis viajes y listas del conductor; bandeja que se refresca sola; franja "Viaje en curso · Volver" también para el pasajero (viajes creados en la web incluidos); confirmación al cerrar sesión y antes de completar ("Cobra S/ X"); banner "Sin conexión. Reintentando…" (`network_status_service.dart`, sin paquetes nuevos); hoja del seguimiento arrastrable desde el contenido. `flutter analyze` sin errores; APK debug compilado pero **no instalado** (el celular se desconectó).
- Servidor: push `offer_not_chosen` a todos los conductores con oferta abierta cuando el viaje se asigna por cualquier vía; `POST /api/trips` y `/delivery` devuelven `expiresAt`/`expiresReason` (helper `TripSearchExpiry`); caché de 60 s de tokens FCM en Trips (`AuthClient.GetFcmTokensAsync` ahora lanza si Auth falla, para no cachear vacío); `Maximum Pool Size=15` en las 6 cadenas de conexión (90 < 100); `127.0.0.1` en `Services:*` y en los valores por defecto del código. No aplicado: bajar el log de las `HubException` esperadas (el filtro de logging ocultaría también errores reales).
- Zonas horarias: revisado a fondo, **no había mezcla**: todo se guarda en UTC desde `2026-10-02_horas_a_utc.sql` (el hallazgo de la prueba en celular comparó una hora ya convertida a Perú). Se corrigieron detalles: días para vencer de documentos por día Perú, fechas leídas entre APIs con el converter, `now()` explícito en UTC en Rewards. Script de control `2026-10-06_fechas_utc.sql` (no cambia nada si ya está bien).
- Datos: sorteo abierto "Sorteo mensual de noviembre" agregado a `bugie_test` (746 tickets) y al seed (queda abierto); `seed.mjs` ya no cuenta como falla los canjes sin saldo.
- Pruebas repetidas tras los cambios: seguridad, admin, sesiones, tiempo real, concurrencia, lotes GPS, recorridos consolidados y Parquet: **todas en verde**. Nota: Pedro tiene un programado hoy 10:00 (Perú) y desde 30 min antes cuenta como ocupado (409 correcto); las pruebas usan a Miguel como conductor libre.

**Respaldo para otra PC:** `backend/bugie_test_backup.sql` (16,5 MB, regenerado tras las correcciones: 990 viajes, 958 recorridos consolidados, 41 934 puntos GPS crudos de los 2 últimos días, 1 sorteo abierto) + `D:	rabajojoseugie_test_respaldougie-uploads.zip` (59 MB, 1 010 archivos: imágenes + `gps-archive` con los Parquet). Pasos en `backend/scripts/test-data/README.md` › "Restaurar la base de prueba en otra PC".

## 7. Scripts SQL (orden; todos aplicados en `bugie_test` y ya incluidos en `backend/bugie_test_backup.sql`)

En `backend/scripts/`, en este orden (también listado en `backend/scripts/test-data/README.md`):

```
2026-10-02_correcciones.sql
2026-10-02_horas_a_utc.sql
2026-10-03_aprobacion_conductores.sql
2026-10-03_contacto_emergencia.sql
2026-10-03_desviaciones.sql
2026-10-03_billetera.sql
2026-10-03_descripciones_config.sql
2026-10-03_parametros.sql
2026-10-03_fotos_vehiculo.sql
2026-10-03_cobros_ranking.sql
2026-10-03_programados.sql
2026-10-03_reclamaciones.sql
2026-10-03_avisos_admin.sql
2026-10-03_reclamaciones_plazos.sql
2026-10-03_conexiones_conductor.sql
2026-10-03_rechazo_suspension.sql
2026-10-03_bandeja_notificaciones.sql
2026-10-03_documento_nombres_cuenta.sql
2026-10-04_avisos_admin_historial.sql
2026-10-04_sesiones.sql
2026-10-04_textos_seguridad_landing.sql
2026-10-04_landing_ciudad_configurable.sql
2026-10-04_aviso_sos_campana.sql
2026-10-04_beneficios_nivel_sorteos.sql
2026-10-05_negociacion_viajes.sql
2026-10-06_indices_rendimiento.sql
2026-10-06_historial_gps.sql
2026-10-06_fechas_utc.sql
2026-10-07_alertas_monitoreo.sql
```

Todos son idempotentes (30). Hoy `bugie_test` es la base del proyecto (ya los tiene; el respaldo `backend/bugie_test_backup.sql` también). Al publicar en producción, la BD nueva se crea con `backscript.sql` + estos scripts en este orden.

**App, 6-oct (noche):** reprueba en el celular de las 10 correcciones: todas OK (incluido el cupón de ticket en el "Sorteo mensual de noviembre"). Diseño de botones unificado (tema `textButtonTheme` w600 y azul claro en oscuro, `filledButtonTheme` nuevo, `DestructiveTextButton` con contorno rojo, secundarios con contorno, diálogos con confirmar relleno y rojo/amarillo según el caso, términos/privacidad del registro abren la web); APK instalado pero **sin capturas** (el celular estaba bloqueado con PIN). Ícono nuevo: la "b" del logo en blanco sobre el degradado de la marca (`bugie_app/assets/icon/`, `flutter_launcher_icons` regenerado; el splash no cambió). Decisión del dueño: "Ya llegué" NO valida distancia (es solo un aviso). Firebase: la llave del 2-oct quedó anulada por Google al publicarse en GitHub; cuando el dueño genere otra, ponerla en `backend/Trips/Bugie.Trips.Api/` y `backend/Rewards/Bugie.Rewards.Api/firebase-service-account.json`.

**7-oct-2026 (Monitoreo y extras), compilado; falta reiniciar las APIs y probar en pantalla:**
- **Monitoreo rediseñado (admin):** pines y líneas por estado (buscando: solo pasajero; en camino: auto + pasajero esperando + punteado auto→recojo; en viaje/SOS: solo auto + bandera de destino + recorrido desde el inicio sólido + lo que falta punteado), agrupación de pines al alejar, buscador único con "Seguir" (panel con vehículo, velocidad, última posición, distancia/ETA, llamar, ver viaje/ficha) y "Ver todos", filtros con contadores (Disponibles, En camino, En viaje, Envíos, Buscando, Desviados, SOS, Sin señal), leyenda, tour actualizado.
- **Todos los viajes activos en Monitoreo** (`live-passengers` ya no exige GPS del pasajero; `passengerLocationKnown`, `serviceType`, `startedAt`). Decisión del dueño: el pin del pasajero es el punto de recojo; una vez iniciado el viaje se sigue solo el GPS del conductor.
- **Alertas de seguimiento** (Trips, servicio cada 30 s, tabla `trips.monitoralerts`): `no_signal` (> `monitor_no_signal_min`=3), `long_stop` (> `monitor_long_stop_min`=5, lejos del destino y paradas), `trip_delayed` (> estimado × (1+`monitor_trip_delay_pct`=50 %) y ≥ +10 min). Endpoints `GET /api/trips/admin/monitor-alerts`, `PUT .../{id}/review`; SignalR `monitor:alert` / `monitor:alert-resolved`; historial y campanita; configurables en Admin › Configuración. Script `2026-10-07_alertas_monitoreo.sql`.
- `GET /api/drivers/online` trae `phone` y `lastLocationAt`; `GET /api/rewards/admin/raffles/{id}/tickets` (participantes y tickets, admin › Sorteos › "Ver participantes"); botón "Descargar GPS original" (CSV desde `/path/raw`) en el detalle del viaje; `my-counter-proposals` con `isMyDriverAccepted`/`myAcceptedFare` y pill "Aceptaste la tarifa" en Solicitudes (app).
- App: borradas ~1 000 líneas sin uso (`TripRequestCard` y clases asociadas); nombre visible "Bugie" (Android `android:label`, iOS `CFBundleDisplayName`/`CFBundleName`).
- Simulador `simular_viajes_en_curso.mjs`: ahora envía la ubicación del pasajero como la app real y suma cuentas de la prueba de carga si los conductores del seed están ocupados. Los 211 conductores de carga quedaron desconectados (`isonline=false`).

## 8. Pendientes y propuestas

**A. Probar en el celular las correcciones de la app** (compiladas, sin instalar): instalar `bugie_app/build/app/outputs/flutter-apk/app-debug.apk` (o recompilar), ajustar `bugie_app/.env` con la IP de la PC, y repetir: conductor con detalle abierto y el pasajero cancela (diálogo); cupón de nivel "hasta el {fecha}"; chips; bandeja que se refresca; franja de viaje activo del pasajero; confirmación al cerrar sesión y al completar; banner sin conexión (desactivar wifi+datos con `svc wifi disable` / `svc data disable`); cupón de ticket en el "Sorteo mensual de noviembre" (canjear el ítem de 5 000 pts con un pasajero que alcance, p. ej. dando puntos con un ajuste del admin).

**A2. Correcciones menores (el dueño pidió dejarlas para después):** racha de Mis puntos corrida un día (`GET /api/rewards/me/progress` resta 5 h dos veces al cruzar medianoche Perú); "hace -1s"; contador "Se cancela en" sigue detrás del diálogo de cancelado; formato de montos (S/ 10,00 vs S/ 10.00, "S/." vs "S/", "10 %" vs "10%"); franja "Viaje en curso" para un programado aún no iniciado (debe decir "Viaje programado"); la franja del pasajero tarda hasta 25 s si el viaje se pidió desde la web; contraste del diálogo "¿Cerrar sesión?" (botones apilados) y del botón "Canjear"; pestañas de Mis puntos cortadas; salto de línea entre "S/" y el monto en "Aceptó tu precio"; tildes en datos de prueba ("dia", "dias"). También: capturas de verificación de los botones nuevos (necesita el celular desbloqueado y con "Permanecer activo"). Código muerto: `TripRequestCard` y clases asociadas en `incoming_requests_screen.dart` (no se usan; no se borró).

**B. Opcionales que quedan:** logger propio para no registrar como error las `HubException` esperadas del hub; vista del viaje activo en el mapa para el conductor en la web (preguntado, sin respuesta).

**C. Del dueño (al publicar):** crear la BD de producción con `backscript.sql` + los 29 scripts (o restaurar el respaldo y limpiar datos de prueba); rotar credenciales versionadas (Firebase/Google/SMTP/JWT/InternalToken) y sacarlas a variables de entorno; celular en `support_phone`; direcciones reales en `appsettings` (`Services:*` sin "localhost", `AllowedOrigins`, `PublicBaseUrl`); dominio en `robots.txt`/`sitemap.xml` y `VITE_PUBLIC_SITE_URL`; carpetas `C:/bugie-uploads` y `gps-archive` con permisos (o `LocalStorage:StoragePath`/`GpsArchive:Folder`); GraphHopper accesible desde Trips; PostgreSQL con `max_connections` ≥ 100 (con pool 15 × 6 APIs) o PgBouncer si se escala a varios servidores; instalar la app firmada.

## 9. Cómo trabajar con él

- Respuestas cortas y claras, sin jerga innecesaria. Si algo no se probó, decirlo.
- Explicar qué se hará → esperar "empieza" → hacer → compilar (solo errores) → probar si se puede → resumir en pocas líneas.
- No asumir que una aprobación vale para otra cosa; si su "empieza" es ambiguo entre dos tareas, preguntar o aclarar a cuál aplica.
