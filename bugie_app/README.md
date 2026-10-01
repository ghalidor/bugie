# Bugie App (Flutter)

App móvil de Bugie para Android e iOS.
Plataforma Integral de Transporte Seguro — Trujillo, Perú.

## Arquitectura

Modular con cebolla suave. Cada módulo se encarga de su propia área y se
puede actualizar sin tocar el resto. El frontend móvil **reutiliza al 100%
las mismas APIs REST + JWT** del backend que ya consume `bugie-web`.

```
lib/
├── core/                      Compartido por todos los módulos
│   ├── api/                   Cliente HTTP único + JWT + manejo 401
│   ├── session/               Token + datos del usuario (storage cifrado)
│   ├── theme/                 Colores Bugie (azul + amarillo)
│   └── widgets/               BugieCard, BugieMap (OpenStreetMap)
│
├── modules/                   Cada módulo es independiente
│   ├── auth/                  Login, Registro, Recuperar password
│   ├── passenger/             Pantallas del pasajero (7)
│   ├── driver/                Pantallas del conductor (10)
│   ├── trips/                 Modelos+repo de viajes (compartido)
│   ├── sos/                   Repo de SOS
│   └── payments/              Modelos+repo de pagos
│
├── router/                    go_router con guards por rol
└── main.dart                  Entry point + Providers
```

### Cómo encajan los módulos

- Solo `core/api/api_client.dart` hace HTTP. Todos los repos lo usan.
- Cada módulo expone repositorios — son la única puerta de entrada.
- Si cambia un endpoint, solo se toca **un repo**, las pantallas no se enteran.
- Frontend y backend independientes: actualizas el módulo de pagos sin
  tumbar el de viajes, y el frontend móvil sigue funcionando si solo cambia
  el backend de un microservicio.

## APIs que consume

Las URLs viven en `.env` y se cargan al arrancar la app.

| API      | Por defecto                | Endpoints clave                                            |
|----------|----------------------------|------------------------------------------------------------|
| Auth     | http://10.0.2.2:5001/api   | /auth/login, /register, /me, /forgot-password              |
| Trips    | http://10.0.2.2:5002/api   | /trips, /trips/active, /trips/{id}/accept, /sos            |
| Drivers  | http://10.0.2.2:5003/api   | /drivers/me, /go-online, /go-offline, /location, /nearby   |
| Payments | http://10.0.2.2:5004/api   | /payments, /payments/earnings, /my-payments                |
| Landing  | http://10.0.2.2:5005/api   | (no se usa en móvil)                                       |

> **Nota:** `10.0.2.2` es el alias del emulador Android para `localhost` del PC.
> Para iOS simulador usa `localhost`. Para celular físico usa la IP de tu PC
> en la red WiFi (ej `192.168.1.10`).

## Stack

- Flutter 3.x / Dart 3.x
- `http` para llamadas REST
- `provider` para estado
- `go_router` para navegación con guards por rol
- `flutter_secure_storage` para guardar el JWT cifrado
- `flutter_map` + `latlong2` para mapas (OpenStreetMap, gratis — igual que el web)
- `geolocator` para GPS
- `flutter_dotenv` para configuración

Sin Bloc, Riverpod ni GetX — el código es lo más simple posible para
quien lea por primera vez. Si en el futuro se necesita escalar el estado,
migrar a Riverpod es directo.

## Cómo correrlo

### 1. Tener Flutter instalado
```bash
flutter --version    # debe ser 3.x
```

### 2. Tener el backend levantado
Desde la carpeta del backend:
```bash
docker-compose up --build
```
Esto levanta SQL Server + las 5 APIs en los puertos 5001-5005.

### 3. Configurar `.env`
Edita `/.env` con la dirección donde corre tu backend:
- Emulador Android: `http://10.0.2.2:5001/api` (lo de por defecto)
- iOS simulador:    `http://localhost:5001/api`
- Celular físico:   `http://TU_IP_LAN:5001/api`

### 4. Instalar dependencias y correr
```bash
flutter pub get
flutter run
```

Para Android: `flutter run -d android`
Para iOS:     `flutter run -d ios`

## Pantallas

### Bienvenida (sin login)
- `/` — Welcome con logo, beneficios y botones Login / Registro

### Auth
- `/login` `/register` `/forgot-password`

### Pasajero (rol = passenger)
- `/passenger`            Dashboard con KPIs y acciones
- `/passenger/request`    Solicitar viaje (mapa + tarifa + Yape/Plin/efectivo)
- `/passenger/tracking`   Seguimiento en tiempo real (polling 3s)
- `/passenger/trips`      Historial
- `/passenger/payments`   Mis pagos
- `/passenger/profile`    Perfil
- `/passenger/sos`        Botón SOS

### Conductor (rol = driver)
- `/driver`                  Dashboard
- `/driver/go-online`        Conectarse / desconectarse
- `/driver/requests`         Solicitudes entrantes (polling 5s) + propuestas
- `/driver/trip-in-progress` Viaje activo + envío de ubicación cada 8s
- `/driver/earnings`         Ganancias (mes/total/viajes)
- `/driver/trips`            Historial
- `/driver/documents`        Estado de documentos + enviar a revisión
- `/driver/vehicles`         Registrar vehículo
- `/driver/profile`          Perfil
- `/driver/sos`              Botón SOS

## Patrones clave (replicados del web)

1. **Cliente HTTP único** (`core/api/api_client.dart`) — mete el JWT
   automáticamente y maneja el 401 limpiando la sesión.
2. **Polling cada 3s** para tracking del pasajero, **5s** para solicitudes
   del conductor, **8s** para enviar ubicación del conductor. Igual que el
   web, no hay WebSockets.
3. **Mapas con OpenStreetMap (CARTO)** — gratis, sin API key, mismo
   look que el web.
4. **Sesión cifrada** con flutter_secure_storage (más seguro que
   SharedPreferences).
5. **Guards por rol** en el router — un pasajero no puede entrar a rutas
   de conductor y viceversa.

## Próximos pasos sugeridos

Cosas que quedan listas para agregar después sin tocar lo demás:
- Push notifications (Firebase) — solo agregar un módulo `notifications`.
- Subida de fotos de documentos — depende de que el backend agregue endpoint.
- Llamadas VoIP / chat (Fase 2 según el Acta).
- Geocoding con Nominatim para autocomplete de direcciones (igual al web).
- Migrar `provider` a `riverpod` si el estado crece.

## Notas honestas

- El backend dice "PostgreSQL" en el Acta pero el `docker-compose.yml`
  realmente levanta **SQL Server** y las connection strings apuntan a
  `MSSQL2022`. El móvil no se entera porque solo habla por HTTP, pero
  conviene saberlo.
- El web usa OpenStreetMap (Nominatim para buscar direcciones, CARTO para
  los tiles del mapa). El móvil usa los mismos tiles de CARTO; el
  geocoding con Nominatim no se incluyó por simplicidad — el usuario
  marca origen y destino tocando el mapa, igual que el flujo del Acta.
