# Plataforma de Player Tracking Bugie

Sistema de Puntos, Promociones y Sorteos para Pasajeros y Conductores.

---

## 1. ¿Qué es el Player Tracking de Bugie?

Player Tracking es un sistema avanzado de lealtad y engagement que rastrea cada interacción de pasajeros y conductores dentro de la plataforma, asignando puntos, desbloqueando niveles y activando promociones y sorteos automáticamente.

- **Seguimiento en Tiempo Real:** rastrea viajes, pagos y calificaciones.
- **Sistema de Niveles:** Bronce, Plata, Oro, Platino.
- **Recompensas Automáticas:** puntos canjeables por premios.
- **Sorteos y Promociones:** sorteos semanales y mensuales.

---

## 2. Sistema de Puntos

### 2.1 ¿Cómo se acumulan los puntos?

**Pasajeros**

| Acción | Puntos |
|---|---|
| Completar un viaje | +100 pts |
| Pagar con Yape/Plin | +50 pts bonus |
| Calificar al conductor (5 estrellas) | +30 pts |
| Referir un amigo | +500 pts |
| Primer viaje del día | +50 pts bonus |
| Viaje en hora punta | +80 pts |

**Conductores**

| Acción | Puntos |
|---|---|
| Completar un viaje | +75 pts |
| Calificación 5 estrellas recibida | +50 pts |
| Verificación fotográfica diaria | +25 pts |
| 0 cancelaciones en el día | +100 pts bonus |
| Meta semanal de viajes cumplida | +500 pts |
| Referir un conductor | +375 pts |

### 2.2 Tasas de conversión

| Rol | Tasa | Regla |
|---|---|---|
| Pasajero | 10 pts por S/. 1 gastado | Por cada sol que el pasajero gasta en viajes. Incentiva gastar más en la plataforma. |
| Conductor | 5 pts por S/. 1 generado | Por cada sol que el conductor genera en viajes completados. Tasa conservadora porque el conductor ya recibe ingreso real por cada viaje. |

**Ejemplos pasajero (10 pts por S/. 1)**

| Caso | Puntos |
|---|---|
| Viaje corto (S/. 8) | 80 pts |
| Viaje medio (S/. 15) | 150 pts |
| Viaje largo (S/. 25) | 250 pts |
| Gasto semanal (S/. 80) | 800 pts |
| Gasto mensual (S/. 320) | 3,200 pts |

**Ejemplos conductor (5 pts por S/. 1)**

| Caso | Puntos |
|---|---|
| Viaje corto (S/. 8) | 40 pts |
| Viaje medio (S/. 15) | 75 pts |
| Viaje largo (S/. 25) | 125 pts |
| Jornada diaria (S/. 120) | 600 pts |
| Semana completa (S/. 600) | 3,000 pts |

> Este modelo asimétrico es el mismo que usan Rappi y Uber globalmente: tasas distintas según el rol para equilibrar el costo de recompensas con el engagement de cada tipo de usuario.

### 2.3 Sistema de niveles

Los niveles se recalculan mensualmente según los puntos acumulados en los últimos 30 días.

**1. BRONCE (0 - 4,999 pts)**
- Acceso básico al catálogo de recompensas
- Participación en sorteos mensuales (1 ticket)
- Descuentos del 5% en viajes seleccionados

**2. PLATA (5,000 - 14,999 pts)**
- Descuentos del 10% en viajes
- Participación en sorteos mensuales (3 tickets)
- Acceso a promociones exclusivas de socios
- Soporte prioritario

**3. ORO (15,000 - 39,999 pts)**
- Descuentos del 15% en viajes
- Participación en sorteos semanales (2 tickets) + mensuales (5 tickets)
- Acceso anticipado a nuevas funciones
- Viajes gratis mensuales (1 viaje)

**4. PLATINO (40,000+ pts)**
- Descuentos del 25% en viajes
- Participación en todos los sorteos (máximos tickets)
- Viajes gratis mensuales (3 viajes)
- Conductor preferencial asignado
- Acceso VIP a eventos Bugie

### 2.4 Tabla de canje

**Pasajeros**

| Puntos | Recompensa |
|---|---|
| 500 | S/. 2 de descuento en próximo viaje |
| 1,000 | Viaje gratis hasta S/. 8 |
| 2,000 | Viaje gratis hasta S/. 15 |
| 3,000 | 1 mes de descuento 10% en todos los viajes |
| 5,000 | 1 ticket extra en sorteo mensual |
| 7,500 | Viaje gratis hasta S/. 25 |
| 10,000 | Producto del catálogo virtual (accesorios, vouchers) |
| 20,000 | Smartphone entry-level o equivalente en créditos |

**Conductores**

| Puntos | Recompensa |
|---|---|
| 500 | Bono de S/. 5 en cuenta Bugie |
| 1,250 | Bono de S/. 15 en cuenta Bugie |
| 2,500 | Bono de S/. 35 en cuenta Bugie |
| 3,750 | Descuento en mantenimiento vehicular (socios afiliados) |
| 5,000 | Bono de S/. 80 en cuenta Bugie |
| 7,500 | Seguro vehicular mensual (socio afiliado) |
| 12,500 | Producto del catálogo virtual premium |
| 25,000 | Gran premio: tablet, herramientas, o equivalente en efectivo |

> Los puntos tienen vigencia de 12 meses desde su acumulación. Los puntos no canjeados se pierden al vencer el período.

### 2.5 Vigencia de puntos

La regla es la misma para pasajeros y conductores:

- **Vigencia base:** 12 meses desde la acumulación del primer punto.
- **Renovación automática:** cada vez que el usuario completa un viaje (pasajero) o un servicio (conductor), la fecha de vencimiento de TODOS sus puntos se renueva por 12 meses adicionales desde esa fecha.
- **Vencimiento:** si no realiza ningún viaje/servicio en 12 meses consecutivos (inactividad total), todos los puntos acumulados se pierden automáticamente.

**Ejemplo pasajero**
- Enero: acumulas 500 pts → vencen en enero del año siguiente.
- Marzo: completas un viaje → todos tus puntos ahora vencen en marzo del año siguiente.
- Octubre: completas otro viaje → todos tus puntos ahora vencen en octubre del año siguiente.

**Ejemplo conductor**
- Febrero: acumulas 1,200 pts → vencen en febrero del año siguiente.
- Abril: completas un servicio → todos tus puntos ahora vencen en abril del año siguiente.
- Diario activo: un conductor activo NUNCA pierde sus puntos porque cada servicio reinicia la vigencia.

> La renovación es automática e instantánea, no requiere ninguna acción del usuario.

> 30 días antes del vencimiento, el sistema enviará notificaciones push recordando al usuario que sus puntos están por expirar.

### 2.6 Ciclo de vida del Punto Bugie

1. **Acción:** el usuario completa un viaje, paga, califica o refiere.
2. **Conversión:** el sistema convierte soles gastados en puntos según la tasa del nivel actual del usuario.
3. **Notificación:** el usuario recibe una push notification al instante: "¡Ganaste +15 pts! Total: 320 pts".
4. **Acumulación:** los puntos se suman al saldo del usuario. El sistema evalúa si sube de nivel automáticamente.
5. **Canje:** el usuario elige canjear sus puntos por descuentos, viajes gratis, productos o tickets de sorteo.
6. **Reinicio:** el ciclo se reinicia.

> Todo el ciclo ocurre en tiempo real. Desde que el conductor marca el viaje como completado hasta que el pasajero recibe su notificación de puntos, el proceso tarda menos de 3 segundos.

---

## 3. Promociones dinámicas

**Pasajeros**

| Promoción | Regla |
|---|---|
| Hora Feliz | Lunes a viernes 12pm-2pm: 2x puntos en todos los viajes |
| Fin de Semana Bugie | Sábados y domingos: descuento del 15% en el primer viaje del día |
| Referido Activo | Si tu referido completa 5 viajes, ganas 200 pts extra |
| Racha de Viajes | 7 días consecutivos usando Bugie = 150 pts bonus |
| Cumpleaños Bugie | Mes de aniversario = 3x puntos en todos los viajes |

**Conductores**

| Promoción | Regla |
|---|---|
| Conductor Estrella Semanal | Top 3 conductores con mejor calificación = S/. 50 bonus |
| Meta de Viajes | Completar 50 viajes en la semana = +200 pts |
| Cero Quejas | Mes sin quejas = nivel de puntos x1.5 |
| Madrugador | Primeros 10 viajes del día (6am-8am) = +20 pts por viaje |
| Conductor del Mes | Premio especial + badge exclusivo en perfil |

---

## 4. Sorteos

| Sorteo | Cuándo | Premio | Participantes | Tickets / Mecánica |
|---|---|---|---|---|
| Semanal | Cada viernes | S/. 100 en créditos Bugie | Nivel Oro y Platino | Oro: 2, Platino: 5. Sorteo automático en la app, ganador notificado al instante |
| Mensual | Último día del mes | Principal: smartphone o tablet (aprox. S/. 800). Secundario: S/. 300 en créditos Bugie (3 ganadores) | Todos los niveles | Bronce: 1, Plata: 3, Oro: 5, Platino: 10 |
| Especial | Navidad, Año Nuevo, Aniversario Bugie | Auto 0km o viaje internacional | Usuarios con más de 6 meses activos | Transmisión en vivo por redes sociales. Tickets extra: por cada 500 pts acumulados en el mes |

> Los sorteos son auditados por un sistema blockchain para garantizar transparencia.

---

## 5. Dashboard del usuario

- Barra de progreso visual hacia el siguiente nivel
- Contador de puntos en tiempo real
- Historial de puntos ganados por actividad
- Tickets activos en sorteos vigentes
- Próximas promociones disponibles
- Ranking entre amigos (leaderboard social)
- Botón de canje de puntos directo al catálogo

El dashboard estará disponible tanto en la app móvil como en la versión web de Bugie.

---

## 6. Implementación técnica

### 6.1 Arquitectura del sistema

| Componente | Función |
|---|---|
| Event Tracking Engine | Captura eventos en tiempo real (viaje completado, pago, calificación) vía WebSockets |
| Points Calculation Service | Microservicio .NET que procesa reglas de negocio y asigna puntos |
| Level Engine | Evalúa y actualiza niveles automáticamente cada 24 horas |
| Promotion Engine | Motor de reglas que activa promociones según condiciones |
| Raffle Service | Servicio de sorteos con generación de números aleatorios verificables |
| Notification Service | Push notifications en tiempo real para puntos ganados y sorteos |

### 6.2 Stack tecnológico

- **Backend:** .NET 8 + SignalR (tiempo real)
- **Base de datos:** PostgreSQL (transacciones) + Redis (caché de puntos)
- **Cola de mensajes:** RabbitMQ para procesamiento asíncrono
- **Notificaciones:** Firebase Cloud Messaging
- **Auditoría:** registro inmutable de todas las transacciones de puntos
- **API:** RESTful + WebSockets para actualizaciones en vivo

### 6.3 Impacto esperado

| Métrica | Valor |
|---|---|
| Retención de usuarios (vs. plataformas sin gamificación) | +40% |
| Frecuencia de uso (semanal, usuarios activos) | +65% |
| Satisfacción del conductor (NPS) | +30% |
| Nuevos registros (vía referidos) | +25% |
| Tiempo en la app (por sesión) | 3x |
| Tasa de cancelación (de viajes) | -20% |

---

## 7. Arquitectura de datos

- **PostgreSQL:** persistencia transaccional (fuente de verdad).
- **Redis:** caché en tiempo real (velocidad y disponibilidad).
- **RabbitMQ:** cola de mensajes (procesamiento asíncrono y desacoplamiento).

Todas las tablas incluyen soft delete (`deleted_at TIMESTAMP`) y auditoría completa. Los índices están optimizados en `user_id`, `created_at` y `expiry_date`.

### 7.1 PostgreSQL: diccionario de datos

#### users_points_profile

Tabla principal del sistema. Almacena el perfil de puntos de cada usuario o conductor.

| Campo | Tipo | Nulo | Restricción | Descripción / Regla de negocio |
|---|---|---|---|---|
| id | UUID | NO | PK, DEFAULT gen_random_uuid() | Identificador único del perfil de puntos |
| user_id | UUID | NO | FK → users.id, UNIQUE | Un usuario solo puede tener un perfil de puntos |
| user_type | ENUM | NO | 'passenger', 'driver' | Determina la tasa de conversión y las reglas de acumulación |
| total_points | INTEGER | NO | DEFAULT 0, CHECK ≥ 0 | Suma histórica de todos los puntos ganados. Nunca disminuye por canje |
| available_points | INTEGER | NO | DEFAULT 0, CHECK ≥ 0 | Puntos disponibles para canje. Se reduce al canjear o expirar |
| redeemed_points | INTEGER | NO | DEFAULT 0, CHECK ≥ 0 | Total de puntos canjeados históricamente |
| current_level | ENUM | NO | DEFAULT 'bronze' | 'bronze', 'silver', 'gold', 'platinum'. Actualizado por Level Engine |
| conversion_rate | DECIMAL(4,1) | NO | DEFAULT 10.0 | Pts por cada S/. 1. Pasajero: 10.0 / Conductor: 5.0. Configurable por admin |
| points_expiry_date | TIMESTAMP | SÍ | NULL si no tiene puntos | Fecha límite de vigencia. Se renueva con cada viaje/servicio completado |
| last_activity_date | TIMESTAMP | SÍ | Actualizado en cada evento | Última acción que generó puntos |
| deleted_at | TIMESTAMP | SÍ | NULL = activo | Soft delete. Si tiene valor, el perfil está inactivo |
| created_at | TIMESTAMP | NO | DEFAULT NOW() | Fecha de creación del perfil |
| updated_at | TIMESTAMP | NO | DEFAULT NOW(), ON UPDATE | Última modificación del registro |

Índices: `idx_points_profile_user_id (user_id)`, `idx_points_profile_expiry (points_expiry_date)`, `idx_points_profile_level (current_level, user_type)`.

#### points_transactions

Registro inmutable de cada movimiento de puntos. Es el libro contable del sistema.

| Campo | Tipo | Nulo | Restricción | Descripción / Regla de negocio |
|---|---|---|---|---|
| id | UUID | NO | PK, DEFAULT gen_random_uuid() | Identificador único de la transacción |
| user_points_profile_id | UUID | NO | FK → users_points_profile.id | Perfil al que pertenece la transacción |
| transaction_type | ENUM | NO | 'earn', 'redeem', 'expire', 'bonus' | 'earn' suma puntos; 'redeem' y 'expire' los restan |
| points_amount | INTEGER | NO | CHECK > 0 | Siempre positivo; el tipo determina si suma o resta |
| source_event | VARCHAR(50) | NO | — | 'trip_completed', 'payment_yape', 'rating_5stars', 'referral', 'daily_first', 'rush_hour', 'photo_verification', 'no_cancellation', 'weekly_goal', 'manual_bonus' |
| reference_id | UUID | SÍ | FK opcional | ID del viaje, sorteo u operación que originó la transacción |
| balance_before | INTEGER | NO | CHECK ≥ 0 | Saldo disponible ANTES de la transacción |
| balance_after | INTEGER | NO | CHECK ≥ 0 | Saldo disponible DESPUÉS. Debe coincidir con available_points del perfil |
| expiry_date | TIMESTAMP | SÍ | NULL para 'redeem' y 'expire' | Se hereda de points_expiry_date del perfil al momento de la transacción |
| notes | TEXT | SÍ | — | Ajustes manuales o correcciones por soporte |
| created_at | TIMESTAMP | NO | DEFAULT NOW(), IMMUTABLE | Nunca se modifica |

> Tabla de solo inserción (append-only). Nunca se actualiza ni elimina un registro. Cualquier corrección se hace con una nueva transacción compensatoria.

Índices: `idx_transactions_user_profile (user_points_profile_id, created_at DESC)`, `idx_transactions_source (source_event, created_at DESC)`, `idx_transactions_expiry (expiry_date)`.

#### levels_config

Configuración de niveles y beneficios por tipo de usuario.

| Campo | Tipo | Nulo | Restricción | Descripción |
|---|---|---|---|---|
| id | UUID | NO | PK | Identificador único del nivel |
| level_name | ENUM | NO | 'bronze', 'silver', 'gold', 'platinum' | Nombre del nivel |
| user_type | ENUM | NO | 'passenger', 'driver' | Tipo de usuario al que aplica |
| min_points | INTEGER | NO | CHECK ≥ 0 | Puntos mínimos para alcanzar el nivel |
| max_points | INTEGER | SÍ | NULL = sin límite superior | NULL para el nivel más alto (Platino) |
| discount_percentage | DECIMAL(4,2) | NO | DEFAULT 0, CHECK 0-100 | % de descuento en viajes para este nivel |
| monthly_free_trips | INTEGER | NO | DEFAULT 0 | Viajes gratis mensuales incluidos |
| weekly_raffle_tickets | INTEGER | NO | DEFAULT 0 | Tickets automáticos en sorteos semanales |
| monthly_raffle_tickets | INTEGER | NO | DEFAULT 1 | Tickets automáticos en sorteos mensuales |
| is_active | BOOLEAN | NO | DEFAULT true | Desactivar un nivel sin eliminarlo |
| created_at | TIMESTAMP | NO | DEFAULT NOW() | Fecha de creación |

#### promotions

Motor de reglas para promociones dinámicas.

| Campo | Tipo | Nulo | Restricción | Descripción |
|---|---|---|---|---|
| id | UUID | NO | PK | Identificador único de la promoción |
| name | VARCHAR(100) | NO | UNIQUE | Nombre interno (ej: 'hora_feliz') |
| description | TEXT | SÍ | — | Descripción visible al usuario en la app |
| promotion_type | ENUM | NO | 'multiplier', 'bonus_points', 'discount', 'free_trip' | Tipo de beneficio |
| target_user_type | ENUM | NO | 'passenger', 'driver', 'both' | A quién aplica |
| multiplier_value | DECIMAL(4,2) | SÍ | CHECK > 0, NULL si no aplica | Factor multiplicador de puntos (ej: 2.0 = doble puntos) |
| bonus_points | INTEGER | SÍ | CHECK > 0, NULL si no aplica | Puntos fijos adicionales |
| start_date | TIMESTAMP | NO | — | Inicio de vigencia |
| end_date | TIMESTAMP | NO | CHECK > start_date | Fin de vigencia |
| conditions | JSONB | SÍ | — | Reglas adicionales: hora del día, día de semana, método de pago, etc. |
| is_active | BOOLEAN | NO | DEFAULT true | Activa/desactiva sin eliminar |
| created_at | TIMESTAMP | NO | DEFAULT NOW() | Fecha de creación |

Índice: `idx_promotions_active (is_active, start_date, end_date) WHERE is_active = true`.

#### raffles

Gestión de sorteos semanales, mensuales y especiales.

| Campo | Tipo | Nulo | Restricción | Descripción |
|---|---|---|---|---|
| id | UUID | NO | PK | Identificador único del sorteo |
| name | VARCHAR(150) | NO | — | Ej: 'Sorteo Semanal - Semana 32' |
| raffle_type | ENUM | NO | 'weekly', 'monthly', 'special' | Determina frecuencia y premios |
| prize_description | TEXT | NO | — | Descripción del premio para el usuario |
| prize_value | DECIMAL(10,2) | NO | CHECK > 0 | Valor estimado del premio en soles |
| draw_date | TIMESTAMP | NO | — | Fecha y hora programada del sorteo |
| min_level_required | ENUM | NO | DEFAULT 'bronze' | Nivel mínimo. 'bronze' = todos pueden participar |
| status | ENUM | NO | DEFAULT 'open' | 'open' (activo), 'closed' (cerrado), 'drawn' |
| winner_user_id | UUID | SÍ | — | Usuario ganador |
| created_at | TIMESTAMP | — | — | Fecha de creación |

#### raffle_tickets

Tickets de participación de cada usuario en cada sorteo.

| Campo | Tipo | Nulo | Restricción | Descripción |
|---|---|---|---|---|
| id | UUID | NO | PK | Identificador único del ticket |
| raffle_id | UUID | NO | FK → raffles.id | Sorteo al que pertenece |
| user_id | UUID | NO | FK → users.id | Usuario propietario |
| ticket_number | VARCHAR(20) | NO | UNIQUE por raffle_id | Formato: YYYYMMDD-XXXXXX |
| source | ENUM | NO | 'level_benefit', 'points_redemption', 'promotion', 'manual' | Origen del ticket |
| points_cost | INTEGER | SÍ | NULL si source != 'points_redemption' | Puntos descontados si se obtuvo por canje |
| is_winner | BOOLEAN | NO | DEFAULT false | true cuando el ticket resulta ganador |
| created_at | TIMESTAMP | — | — | Fecha de creación |

Índices: `idx_tickets_raffle (raffle_id)`, `idx_tickets_user (user_id, raffle_id)`.

### 7.2 Redis: caché en tiempo real

El saldo de puntos se consulta en cada viaje, cada apertura de app y cada notificación. Redis actúa como caché (< 1ms) para no consultar PostgreSQL en cada request.

| Key | Valor | TTL | Uso |
|---|---|---|---|
| `points:user:{user_id}` | `{ available_points, total_points, level, expiry_date, conversion_rate }` | 24 h (se refresca con cada transacción) | Consulta del saldo sin tocar PostgreSQL |
| `level:user:{user_id}` | `{ level, next_level, points_needed, discount }` | 24 h | Progreso en el dashboard |
| `promotions:active:{user_type}` | Array JSON de promociones vigentes | 1 h (se invalida cuando el admin activa/desactiva una promoción) | El Promotion Engine lo consulta antes de calcular puntos |
| `raffles:open` | Array JSON de sorteos con estado 'open' | 6 h | Sorteos disponibles en el dashboard |

Ejemplo de valor de `points:user:{user_id}`:

```json
{ "available_points": 3200, "total_points": 4500, "level": "silver", "expiry_date": "2027-08-09", "conversion_rate": 10.0 }
```

Ejemplo de valor de `level:user:{user_id}`:

```json
{ "level": "silver", "next_level": "gold", "points_needed": 11800, "discount": 10 }
```

**Estrategia de invalidación y sincronización**
- **Write-through:** cuando se actualiza PostgreSQL, Redis se actualiza simultáneamente en la misma transacción.
- **Cache miss:** si Redis no tiene el dato (TTL expirado), se consulta PostgreSQL y se repopula Redis.
- **Invalidación activa:** cuando el Points Calculation Service procesa una transacción, invalida y reescribe las keys afectadas del usuario.
- **Consistencia:** si Redis falla, el sistema usa PostgreSQL sin interrumpir el servicio.

Métricas objetivo: < 1ms de lectura en Redis, 95% de consultas resueltas desde caché, 0 pérdida de datos (PostgreSQL es la fuente de verdad).

### 7.3 RabbitMQ: colas de mensajes

El cálculo de puntos, la evaluación de niveles y las notificaciones NO deben bloquear la respuesta al usuario. El viaje se confirma en < 200ms y el procesamiento de puntos ocurre de forma asíncrona.

**Exchange:** `bugie.player-tracking` (topic exchange)

| Cola | Routing key | Producer | Consumer | Payload | Prioridad |
|---|---|---|---|---|---|
| `points.calculation.queue` | trip.completed | Trip Service | Points Calculation Service | `{ trip_id, user_id, driver_id, amount, payment_method, rating, timestamp }` | Alta (< 3 segundos) |
| `level.evaluation.queue` | points.updated | Points Calculation Service | Level Engine | `{ user_id, new_balance, previous_balance, user_type }` | Media |
| `promotion.check.queue` | trip.completed, payment.completed | Trip Service, Payment Service | Promotion Engine | `{ user_id, event_type, context_data, timestamp }` | Alta (antes de confirmar puntos) |
| `notification.dispatch.queue` | points.earned, level.changed, raffle.won, points.expiring | Points Service, Level Engine, Raffle Service | Notification Service → Firebase Cloud Messaging | `{ user_id, notification_type, title, body, data }` | Media |
| `points.expiry.check.queue` | scheduled.daily | Scheduler Service (cron diario 2am) | Expiry Service | `{ check_date, batch_size }` | Baja (nocturno) |

**Garantías y configuración**
- **Durabilidad:** todas las colas son `durable=true`.
- **Acknowledgment:** manual ACK, el mensaje se elimina solo cuando el consumer confirma.
- **Dead Letter Queue:** mensajes fallidos después de 3 reintentos van a `bugie.dlq`.
- **Retry policy:** exponential backoff de 1s, 5s, 30s.
- **Prefetch count:** 10 mensajes por consumer.
- **Monitoring:** Prometheus + Grafana.
- **Producción:** cluster de 3 nodos con mirrored queues. Ningún mensaje de puntos puede perderse.

### 7.4 Flujo end-to-end: viaje completado → puntos acreditados

1. **Viaje completado (T+0ms):** el conductor marca el viaje como completado. Trip Service actualiza el viaje en PostgreSQL (tabla `trips`) y responde con confirmación inmediata.
2. **Evento publicado (T+10ms):** Trip Service publica `trip.completed` en `bugie.player-tracking` con `{ trip_id, passenger_id, driver_id, amount: 15.00, payment_method: "yape", passenger_rating: 5, driver_rating: 5, timestamp }`.
3. **Promotion Engine (T+50ms):** consume desde `promotion.check.queue`, consulta Redis (`promotions:active:passenger` y `promotions:active:driver`), evalúa promociones y devuelve multiplicadores al Points Calculation Service.
4. **Cálculo de puntos (T+200ms):** calcula puntos para ambos usuarios:
   - Pasajero: (S/. 15 × 10 pts) + 50 pts Yape + 30 pts rating 5★ + multiplicador promoción = 230 pts
   - Conductor: (S/. 15 × 5 pts) + 50 pts rating 5★ recibida + 25 pts verificación = 150 pts
   - Actualiza `points_transactions` y `users_points_profile` en transacción atómica.
5. **Caché actualizado (T+250ms):** reescribe `points:user:{passenger_id}`, `points:user:{driver_id}` y `level:user:{id}` si corresponde.
6. **Evaluación de nivel (T+300ms):** Level Engine consume `points.updated`, compara con `levels_config`. Si sube de nivel, actualiza PostgreSQL + Redis y publica `level.changed`.
7. **Notificaciones (T+500ms a T+3000ms):** Notification Service envía push vía FCM:
   - Pasajero: "🎉 ¡Ganaste 230 pts! Saldo: 3,430 pts"
   - Conductor: "⭐ ¡Ganaste 150 pts! Saldo: 2,150 pts"
   - Si subió de nivel: "🏆 ¡Subiste a nivel Plata! Nuevos beneficios desbloqueados"
8. **Dashboard actualizado (tiempo real):** SignalR notifica al dashboard sin refrescar la app.

> Confirmación del viaje en < 200ms. Puntos en el saldo en < 3 segundos.

### 7.5 Índices, performance y escalabilidad

**Índices en PostgreSQL**

```sql
CREATE INDEX idx_points_profile_user_id ON users_points_profile(user_id);
CREATE INDEX idx_points_profile_expiry ON users_points_profile(points_expiry_date) WHERE points_expiry_date IS NOT NULL;
CREATE INDEX idx_points_profile_level ON users_points_profile(current_level, user_type);

CREATE INDEX idx_transactions_user_profile ON points_transactions(user_points_profile_id, created_at DESC);
CREATE INDEX idx_transactions_source ON points_transactions(source_event, created_at DESC);
CREATE INDEX idx_transactions_expiry ON points_transactions(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE INDEX idx_tickets_raffle ON raffle_tickets(raffle_id);
CREATE INDEX idx_tickets_user ON raffle_tickets(user_id, raffle_id);

CREATE INDEX idx_promotions_active ON promotions(is_active, start_date, end_date) WHERE is_active = true;
```

**Estrategia de escalabilidad**
- **Particionamiento:** `points_transactions` se particiona por mes (`PARTITION BY RANGE created_at`). Permite purgar históricos y las consultas recientes solo escanean la partición actual.
- **Read replicas:** 1 réplica de lectura para reportes y back office. Points Calculation Service escribe en primary; el dashboard lee de la réplica. Reduce carga del primario hasta 60%.
- **Connection pooling:** PgBouncer entre .NET y PostgreSQL, máximo 100 conexiones activas.
- **Archivado automático:** transacciones de más de 24 meses se mueven a `points_transactions_archive`. Job nocturno a las 3am vía Hangfire.

Métricas objetivo: < 5ms consulta de saldo, 10,000 transacciones/hora de capacidad inicial, 99.9% uptime.

---

## 8. Glosario

### Términos de negocio

- **Player Tracking:** sistema que registra cada interacción del usuario para asignar puntos, niveles y recompensas automáticamente.
- **Puntos Bugie:** unidad de valor del programa de lealtad. Se acumulan por acciones y se canjean por descuentos, viajes gratis o productos.
- **Tasa de Conversión:** relación entre dinero gastado/generado y puntos. Pasajeros: S/. 1 = 10 pts. Conductores: S/. 1 = 5 pts.
- **Nivel de Usuario:** Bronce, Plata, Oro o Platino según puntos acumulados. Determina los beneficios.
- **Canje de Puntos:** intercambio de puntos por recompensas del catálogo virtual.
- **Vigencia de Puntos:** 12 meses. Se renueva automáticamente con cada viaje o servicio completado.
- **Gamificación:** mecánicas de juego (puntos, niveles, logros, rankings) para aumentar engagement y retención.
- **Engagement:** nivel de interacción del usuario. Se mide por frecuencia de uso, tiempo en app y acciones.
- **Sorteo:** premio aleatorio con tickets según nivel. Semanales, mensuales y especiales.
- **Ticket de Sorteo:** cupón virtual para participar en un sorteo. Se obtiene por nivel o canjeando puntos.
- **Promoción Dinámica:** oferta temporal que multiplica puntos o aplica descuentos bajo condiciones (hora, día, comportamiento).
- **NPS (Net Promoter Score):** métrica de satisfacción y probabilidad de recomendar Bugie.

### Términos técnicos

- **.NET 8:** plataforma de Microsoft para los microservicios del backend.
- **SignalR:** librería .NET de comunicación bidireccional en tiempo real vía WebSockets. Actualiza el dashboard al instante.
- **WebSocket:** protocolo que mantiene una conexión abierta para enviar datos en ambas direcciones sin nuevas peticiones.
- **Microservicio:** componente independiente con una función específica (ej: Points Calculation Service).
- **Firebase Cloud Messaging (FCM):** servicio de Google para push notifications en Android e iOS.
- **Event Tracking Engine:** captura eventos en tiempo real (viaje, pago, calificación) y los publica en RabbitMQ.
- **RabbitMQ:** mensajería asíncrona entre microservicios mediante colas.
- **Redis:** base de datos en memoria (< 1ms) usada como caché de saldos, niveles y promociones.
- **PostgreSQL:** base de datos relacional, fuente de verdad de puntos, niveles y sorteos.
- **Dead Letter Queue (DLQ):** cola para mensajes que fallaron tras varios reintentos.
- **Exponential Backoff:** reintentos con espera creciente (1s, 5s, 30s).
- **PgBouncer:** connection pooling para PostgreSQL.

### Términos de base de datos

- **UUID:** identificador único de 128 bits. Se usa como PK en todas las tablas.
- **PK (Primary Key):** campo que identifica de forma única cada fila.
- **FK (Foreign Key):** campo que referencia la PK de otra tabla (ej: user_id en users_points_profile → users).
- **ENUM:** tipo que solo acepta valores predefinidos (ej: user_type = 'passenger' o 'driver').
- **JSONB:** JSON binario de PostgreSQL. Usado para las condiciones de promociones.
- **TIMESTAMP:** fecha y hora con precisión de microsegundos.
- **Soft Delete:** se marca `deleted_at = NOW()` en lugar de borrar el registro.
- **Índice:** estructura que acelera consultas sin escanear toda la tabla.
- **Índice Parcial:** índice solo sobre filas que cumplen una condición (ej: `WHERE expiry_date IS NOT NULL`).
- **Table Partitioning:** división de una tabla grande en particiones (ej: points_transactions por mes).
- **Read Replica:** copia de solo lectura para distribuir carga.
- **Write-Through Cache:** cada escritura en la base de datos actualiza también Redis.
