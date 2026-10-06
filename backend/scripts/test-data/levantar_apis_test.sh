#!/usr/bin/env bash
# Levanta las 6 APIs apuntando a la base de prueba bugie_test.
# No modifica ningun appsettings: todo va por variables de entorno.
# Logs en scripts/test-data/logs/<servicio>.log
cd "$(dirname "$0")/../.."
mkdir -p scripts/test-data/logs
export ConnectionStrings__Default="Host=localhost;Port=5432;Database=bugie_test;Username=postgres;Password=147896321;"
export ASPNETCORE_ENVIRONMENT=Development
# Entre APIs por 127.0.0.1 (no "localhost"): evita el intento IPv6 previo de Windows en cada conexion nueva.
export Services__AuthApi=http://127.0.0.1:5001 Services__TripsApi=http://127.0.0.1:5002 Services__DriversApi=http://127.0.0.1:5003 Services__PaymentsApi=http://127.0.0.1:5004 Services__LandingApi=http://127.0.0.1:5005 Services__RewardsApi=http://127.0.0.1:5006
for svc in Auth Trips Drivers Payments Landing Rewards; do
  # Las imagenes van a la carpeta de appsettings (LocalStorage:StoragePath)
  dotnet run --no-build --no-launch-profile --project "$svc/Bugie.$svc.Api" \
    > "scripts/test-data/logs/${svc,,}.log" 2>&1 &
  echo "$svc PID $!"
done
wait
