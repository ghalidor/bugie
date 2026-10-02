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
| conductor | miguel.cutipa@bugie.test | Miguel Angel Cutipa | aprobado, en linea |
| conductor | pedro.mendoza@bugie.test | Pedro Mendoza Calle | aprobado, en linea (referido de Lucia) |
| conductor | raul.ccama@bugie.test | Raul Ccama Limachi | en revision, SOAT rechazado |
| pasajero | lucia.mamani@bugie.test | Lucia Mamani Quispe | verificado, mas viajes y puntos |
| pasajero | carlos.ticona@bugie.test | Carlos Ticona Flores | verificado (referido de Lucia), **viaje EN CURSO** |
| pasajero | maria.choque@bugie.test | Maria Fernanda Choque | verificado, tuvo un SOS |
| pasajero | jorge.apaza@bugie.test | Jorge Luis Apaza | verificado, **viaje PENDIENTE** buscando conductor |
| pasajero | rosa.condori@bugie.test | Rosa Elena Condori | verificado |
| pasajero | diego.huanca@bugie.test | Diego Huanca Rivera | rechazado (DNI ilegible) |
| pasajero | ana.paredes@bugie.test | Ana Paredes Coaquira | pendiente de revision |

Ciudad: Tacna (es la `default_city` de la configuracion). Fechas repartidas en los ultimos 30 dias.

Ademas hay: viajes con "Ya llegue" (aviso del conductor), cancelaciones del conductor
y del pasajero con motivo, negociaciones cerradas al cancelar, pagos a conductores
(bonos por Yape/Plin, premio de sorteo por transferencia, un pago manual en efectivo)
y el recorrido GPS de cada viaje para verlo en el admin (Viajes > Ver detalle y recorrido).

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

Se envian ~23 correos reales a ghaluix@gmail.com (bienvenidas, activaciones, rechazo,
invitacion de referido, respuesta de contacto).

```bash
# desde backend/
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS bugie_test WITH (FORCE)"
psql -U postgres -d postgres -c "CREATE DATABASE bugie_test"
psql -U postgres -d bugie_test -f backscript.sql
psql -U postgres -d bugie_test -f scripts/2026-10-02_correcciones.sql
psql -U postgres -d bugie_test -f scripts/2026-10-02_horas_a_utc.sql
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
| `03_repartir_fechas.sql` | Reparte las fechas en los ultimos 30 dias (ejecutar una vez tras el seed) |
