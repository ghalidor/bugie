# Bugie: estado del proyecto (traspaso para otra sesión de Claude)

Actualizado: 5 de octubre de 2026 (noche). Léelo completo antes de tocar nada. Complementa a `CLAUDE.md`, `docs/Bugie_Acta_Inicio_Proyecto.md` y `docs/Player_Tracking_Bugie.md`.

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

## 7. Scripts SQL (orden; aplicados en `bugie_test`, la base real los tiene pendientes)

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
```

Todos son idempotentes. Correrlos en la base real le corresponde al dueño.

## 8. Pendientes

1. **Probar la app en el celular** con la negociación nueva y el tiempo real: compila y pasa `flutter analyze`, pero no se instaló en el dispositivo.
2. Opcional ofrecido: que `seed.mjs` genere recorridos GPS más realistas (hoy son una línea casi recta con la misma hora). Solo en el script de pruebas.
3. Opcional ofrecido: lista de tickets por sorteo en el admin (hoy no existe; habría que exponerla en el backend).
4. Del dueño: correr los scripts en la base real, rotar credenciales, poner un celular en `support_phone`, al desplegar poner direcciones reales en `appsettings`, el dominio en `robots.txt`/`sitemap.xml` y `VITE_PUBLIC_SITE_URL`.

## 9. Cómo trabajar con él

- Respuestas cortas y claras, sin jerga innecesaria. Si algo no se probó, decirlo.
- Explicar qué se hará → esperar "empieza" → hacer → compilar (solo errores) → probar si se puede → resumir en pocas líneas.
- No asumir que una aprobación vale para otra cosa; si su "empieza" es ambiguo entre dos tareas, preguntar o aclarar a cuál aplica.
