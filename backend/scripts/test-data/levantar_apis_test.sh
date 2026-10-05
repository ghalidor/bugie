#!/usr/bin/env bash
# Levanta las 6 APIs apuntando a la base de prueba bugie_test.
# No modifica ningun appsettings: todo va por variables de entorno.
# Logs en scripts/test-data/logs/<servicio>.log
cd "$(dirname "$0")/../.."
mkdir -p scripts/test-data/logs
export ConnectionStrings__Default="Host=localhost;Port=5432;Database=bugie_test;Username=postgres;Password=147896321;"
export ASPNETCORE_ENVIRONMENT=Development
for svc in Auth Trips Drivers Payments Landing Rewards; do
  # Las imagenes van a la carpeta de appsettings (LocalStorage:StoragePath)
  dotnet run --no-build --no-launch-profile --project "$svc/Bugie.$svc.Api" \
    > "scripts/test-data/logs/${svc,,}.log" 2>&1 &
  echo "$svc PID $!"
done
wait
