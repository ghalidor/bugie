# Bugie: Acta de Inicio del Proyecto

Plataforma Integral de Transporte Seguro.

| Dato | Valor |
|---|---|
| Cliente | Luis Ishikawa Hoyle (Product Owner) |
| Proveedor | InteliaDevs S.A.C. |
| Fecha de inicio | 09 de febrero de 2026 |
| Duración | 14 semanas (3.5 meses) |
| Ubicación | Trujillo, Perú |
| Versión | 1.0 - Documento de Ratificación y Planificación |

---

## 1. Visión: revolucionando la seguridad en Trujillo

**El desafío actual**
- **Crisis de confianza:** inseguridad y delincuencia en el transporte público.
- **Informalidad:** ~30,000 taxis operando en un mercado fragmentado.
- **Riesgo:** conductores no verificados y ausencia de monitoreo.

**La solución Bugie**
- **Seguridad total:** verificación física y monitoreo 24/7.
- **Tecnología:** app móvil + reconocimiento facial diario.
- **Promesa:** "Donde quieras, cuando quieras Bugie te lleva."

**Objetivo estratégico:** lanzar un MVP funcional en 14 semanas y posicionarse como líder en transporte seguro.

---

## 2. El ecosistema Bugie: tres pilares conectados

Los tres pilares se sincronizan en tiempo real entre sí.

| Pilar | Descripción |
|---|---|
| Aplicación Móvil | Pasajeros y conductores (iOS/Android). Registro, tracking y pagos. |
| Plataforma Web | Solicitud de viajes responsive y gestión de perfil. |
| Back Office Administrativo | Centro de monitoreo, validación y gestión de zonas. |

Una solución integral construida sobre una arquitectura escalable, conectando a todos los actores.

---

## 3. Seguridad como ADN: diferenciadores

Enfoque híbrido: validación física + tecnología digital.

| Diferenciador | Descripción |
|---|---|
| Verificación Presencial | Validación física de documentos (DNI, SOAT, antecedentes) en oficinas. |
| Reconocimiento Facial | Validación biométrica diaria obligatoria para conductores. |
| Centro de Monitoreo 24/7 | Supervisión humana activa de viajes y alertas. |
| Respuesta SOS Dual | Botón de pánico conectado a monitoreo y Policía Nacional. |
| Alianza Táctica | Coordinación directa con autoridades. |

---

## 4. Alcance del MVP vs. visión futura

**Incluido en el MVP (14 semanas)**
- **Apps nativas** (iOS/Android) con Flutter.
- **Pagos:** efectivo e integración Yape/Plin.
- **Seguridad:** botón SOS, tracking, Face ID.
- **Back Office:** dashboard, mapa en vivo, gestión de usuarios.
- **Web:** versión responsive para pasajeros.

**Exclusiones (Fase 2, post-MVP)**
- Pagos directos con tarjeta de crédito/débito.
- Sistema de puntos y recompensas (catálogo).
- Chat en tiempo real y llamadas VoIP in-app.
- Viajes programados o paradas múltiples.

> El foco actual es la velocidad de lanzamiento y la seguridad crítica. Las funcionalidades de fidelización se desarrollarán tras validar el mercado.

---

## 5. Arquitectura y stack tecnológico

**Arquitectura:** Onion Architecture (capas: API/Presentation → Infrastructure → Application Logic → núcleo). Diseño limpio que garantiza mantenibilidad.

| Capa | Tecnología |
|---|---|
| Backend | .NET 8 + Entity Framework Core |
| Frontend Mobile | Flutter (iOS/Android unificado) |
| Frontend Web | React / Next.js |
| Database | PostgreSQL |
| Infraestructura | Docker + CI/CD (GitHub Actions) |

> Despliegue en servicios cloud (Railway/Render). Los costos de infraestructura (Google Maps API, Firebase) son responsabilidad del cliente.

---

## 6. Experiencia de usuario

**Pasajero**
- Login social rápido
- Solicitud con tarifa estimada
- Tracking en tiempo real
- Pagos digitales (Yape/Plin)

**Conductor**
- Validación documental física
- Face ID diario
- Gestión de disponibilidad
- Billetera de ganancias

Pantalla de verificación del conductor (según el mockup): información básica, licencia de conducir, confirmación de ID, información acerca del vehículo, contacto de emergencia, carta de antecedentes no penales, SOAT.

> Interfaces diseñadas para operación rápida y segura en movimiento.

---

## 7. Centro de Comando (Back Office)

| Módulo | Función |
|---|---|
| Dashboard | Métricas en tiempo real de viajes y conductores. |
| Monitoreo | Mapa interactivo con alertas de desviación. |
| Gestión SOS | Priorización de eventos y respuesta a incidencias. |
| Validación | Flujo de aprobación de documentos de conductores. |

> Control total de la operación mediante alertas automatizadas por IA.

---

## 8. Equipo y metodología

**Metodología Scrum**
- Sprint: 1 semana
- Planning: lunes
- Daily Standup: 15 minutos
- Review/Retro: viernes

**Estructura del equipo (InteliaDevs)**
- José Ishikawa: Gerente de Proyecto / Scrum Master
- Richard Blanco: Arquitecto de Software
- Equipo de desarrollo: 2 Full Stack Devs + 1 QA (desde Sprint 3)

**Herramientas de comunicación:** Slack (diario), Google Meet (ceremonias), Jira (backlog).

---

## 9. Roadmap de ejecución (14 semanas)

Inicio: 9 de febrero de 2026. Lanzamiento: 15 de mayo de 2026.

| Fase | Semanas | Foco |
|---|---|---|
| Fase 1 | 1-2 | Fundamentos y Auth |
| Fase 2 | 3-5 | Core: Conductores y Viajes (hito: primer viaje simulado) |
| Fase 3 | 6-7 | Seguridad y SOS |
| Fase 4 | 8-10 | Back Office y Web |
| Fase 5 | 11-14 | Testing y Lanzamiento |

> Cronograma estimado, sujeto a ajustes según avance del proyecto.

### Planificación por sprint

| Sprints | Fechas | Foco principal | Entregables clave |
|---|---|---|---|
| 1-2 | Feb 9 - 20 | Setup & Auth | DB Design, Login/Register |
| 3-4 | Feb 23 - Mar 6 | Conductores | Registro, Validación Docs, Solicitud Viajes |
| 5-7 | Mar 9 - 27 | Core & Seguridad | Tracking Real-time, SOS, Yape/Plin |
| 8-10 | Mar 30 - Abr 17 | Admin & Web | Dashboard, Monitoreo, Web Responsive |
| 11-12 | Abr 20 - May 1 | QA & Docs | Testing Integral, Manuales |
| 13-14 | May 4 - 15 | Refinamiento | Despliegue Final, Soporte Lanzamiento |

> Cada viernes se realiza una demo (Sprint Review) para validar progreso.

---

## 10. Criterios de calidad y éxito

**Definition of Done (DoD)**
- Código implementado y revisado (Code Review).
- Pruebas unitarias > 70% de cobertura.
- Aprobación formal de QA.
- Validación del Product Owner.

**KPIs de éxito**

| KPI | Meta |
|---|---|
| Disponibilidad del sistema | 99.5% |
| Latencia de API | < 500ms |
| Tiempo de respuesta SOS | < 2 min |
| Viajes simulados exitosos (end-to-end) | 100 |

---

## 11. Gestión de riesgos y cambios

| Riesgo | Mitigación |
|---|---|
| Dependencias de terceros (APIs Maps/Firebase) | Pruebas de integración tempranas (Sprint 1-2) |
| Cambios de alcance | Control estricto de backlog y priorización |

**Protocolo de cambios**
- **Cambios menores (< 8h):** absorbidos en el sprint.
- **Cambios mayores (> 8h):** requieren re-presupuesto.
- **Extensión de plazo:** S/ 3,000 por cada 15 días extra (causa cliente).

---

## 12. Inversión y cronograma de pagos

**Total inversión: S/ 21,000**

| Mes | Monto |
|---|---|
| Febrero (inicio) | S/ 6,000 |
| Marzo | S/ 6,000 |
| Abril | S/ 6,000 |
| Mayo (contra entrega) | S/ 3,000 |

**Exclusiones (costos del cliente)**
- Infraestructura cloud (AWS/Railway)
- Google Maps API & Firebase
- Dominios y certificados SSL
- Hardware para verificaciones

---

## 13. Próximos pasos

- Firma del Acta de Proyecto.
- Pago del primer hito (febrero).
- Kick-off Meeting: 08 de febrero.
- Inicio Sprint 1: 09 de febrero.

**Contacto:** InteliaDevs S.A.C. | joseishikawahoyle@gmail.com
