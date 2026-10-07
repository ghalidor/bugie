using System.Collections.Concurrent;
using System.Text.Json;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Services;

/// <summary>
/// Alertas de monitoreo detectadas en el servidor (además del SOS y el desvío).
/// MonitorAlertsBackgroundService llama a RunPassAsync cada 30 s:
///
///   * no_signal: viaje 2/3/6 cuyo conductor no envía GPS hace más de
///     monitor_no_signal_min. Último GPS = lo que llegó al reenvío
///     (DriverGpsTracker) o, si Trips se reinició, drivers.Drivers.CurrentLocationAt.
///     Gracia al arrancar = el umbral: sin datos en memoria no se abre nada.
///   * long_stop: viaje 3 con el auto detenido (se movió menos de 50 m) más de
///     monitor_long_stop_min y a más de 150 m del destino (y de las paradas).
///     Solo con GPS reciente en memoria (si no hay señal, ya avisa no_signal).
///   * trip_delayed: viaje 3 que lleva más que la duración estimada ×
///     (1 + monitor_trip_delay_pct/100) y al menos 10 min más. Duración estimada:
///     ruta planificada (distancia a 22 km/h) → GraphHopper → distancia a 22 km/h.
///
/// Una sola alerta abierta por (viaje, tipo). Mientras sigue la condición solo
/// se actualiza LastSeenAt/Details; se resuelve sola cuando la condición termina
/// o el viaje deja de estar en 2/3/6. Revisarla no la cierra.
/// </summary>
public class MonitorAlertsService
{
    private enum State { Unknown, Inactive, Active }

    private sealed record Detection(State State, int Minutes = 0, object? Details = null,
                                    string? Title = null, string? Message = null)
    {
        public static readonly Detection Unknown = new(State.Unknown);
        public static readonly Detection Inactive = new(State.Inactive);
    }

    // Duración estimada (min) por viaje cuando sale de GraphHopper o de la
    // distancia: se calcula una vez y se recuerda un rato.
    private static readonly ConcurrentDictionary<Guid, (double Minutes, string Source, DateTime At)> _estimates = new();
    private static readonly TimeSpan EstimateTtl = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan FallbackEstimateTtl = TimeSpan.FromMinutes(5);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly IMonitorAlertRepository _repo;
    private readonly ITripRepository _trips;
    private readonly IRoutingService _routing;
    private readonly ILandingClient _landing;
    private readonly IAdminNotifier _notifier;
    private readonly DriverGpsTracker _gps;

    public MonitorAlertsService(IMonitorAlertRepository repo, ITripRepository trips,
                                IRoutingService routing, ILandingClient landing,
                                IAdminNotifier notifier, DriverGpsTracker gps)
    {
        _repo = repo;
        _trips = trips;
        _routing = routing;
        _landing = landing;
        _notifier = notifier;
        _gps = gps;
    }

    /// <summary>
    /// Una pasada. serviceStartedUtc: cuando arrancó el servicio (gracia de
    /// no_signal). onError: se llama por cada viaje que falló (la pasada sigue).
    /// </summary>
    public async Task RunPassAsync(DateTime serviceStartedUtc, Action<Exception, Guid>? onError,
                                   CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var settings = await MonitorAlertRules.LoadAsync(_landing, ct);
        var trips = await _repo.GetMonitoredTripsAsync(ct);
        var open = await _repo.GetOpenAsync(ct);
        var openByKey = open
            .GroupBy(a => (a.TripId, a.Type))
            .ToDictionary(g => g.Key, g => g.First());
        var inGrace = now - serviceStartedUtc < TimeSpan.FromMinutes(settings.NoSignalMinutes);

        foreach(var trip in trips)
        {
            try
            {
                var driver = string.IsNullOrWhiteSpace(trip.DriverName) ? "el conductor" : trip.DriverName.Trim();

                await ApplyAsync(trip, MonitorAlert.TypeNoSignal,
                    CheckNoSignal(trip, settings, now, inGrace, driver), openByKey, ct);

                openByKey.TryGetValue((trip.TripId, MonitorAlert.TypeLongStop), out var openStop);
                await ApplyAsync(trip, MonitorAlert.TypeLongStop,
                    await CheckLongStopAsync(trip, settings, now, driver, openStop is not null, ct), openByKey, ct);

                await ApplyAsync(trip, MonitorAlert.TypeTripDelayed,
                    await CheckTripDelayedAsync(trip, settings, now, driver, ct), openByKey, ct);
            }
            catch(Exception ex) when(ex is not OperationCanceledException)
            {
                onError?.Invoke(ex, trip.TripId);
            }
        }

        // Alertas de viajes que ya no están en 2/3/6: se resuelven.
        var active = trips.Select(t => t.TripId).ToHashSet();
        foreach(var a in open.Where(a => !active.Contains(a.TripId)))
        {
            try
            {
                await ResolveAsync(a, ct);
            }
            catch(Exception ex) when(ex is not OperationCanceledException)
            {
                onError?.Invoke(ex, a.TripId);
            }
        }

        foreach(var key in _estimates.Keys)
            if(!active.Contains(key)) _estimates.TryRemove(key, out _);
    }

    // ── Reglas ────────────────────────────────────────────────────────────

    private Detection CheckNoSignal(MonitorTripSnapshot trip, MonitorAlertSettings s, DateTime now,
                                    bool inGrace, string driver)
    {
        var gps = _gps.Get(trip.DriverId);
        // Recién arrancado y sin datos en memoria: esperamos (sin falsos positivos).
        if(gps is null && inGrace) return Detection.Unknown;

        // Desde cuándo se espera GPS: aceptación del viaje (un programado, desde
        // que "llega su momento": 30 min antes de la hora).
        var expectedSince = trip.AcceptedAt ?? trip.StartedAt ?? trip.CreatedAt;
        if(trip.Status == 2 && trip.ScheduledAt.HasValue)
            expectedSince = Max(expectedSince, trip.ScheduledAt.Value.AddMinutes(-ScheduledTrips.ActivateBeforeMinutes));

        DateTime? last = gps?.AtUtc;
        if(trip.DriverLocationAt.HasValue && (last is null || trip.DriverLocationAt.Value > last))
            last = trip.DriverLocationAt.Value;

        var silentSince = last.HasValue ? Max(last.Value, expectedSince) : expectedSince;
        var silentMin = (now - silentSince).TotalMinutes;
        if(silentMin <= s.NoSignalMinutes) return Detection.Inactive;

        var minutes = (int)Math.Floor(silentMin);
        return new Detection(State.Active, minutes,
            new
            {
                minutes,
                thresholdMin = s.NoSignalMinutes,
                lastLat = gps?.Lat ?? trip.DriverLat,
                lastLng = gps?.Lng ?? trip.DriverLng,
                source = gps is not null ? "relay" : (trip.DriverLocationAt.HasValue ? "drivers_db" : "none"),
            },
            "Sin señal",
            $"Sin señal: {driver} no envía su ubicación hace {minutes} min");
    }

    private async Task<Detection> CheckLongStopAsync(MonitorTripSnapshot trip, MonitorAlertSettings s,
                                                     DateTime now, string driver, bool alreadyOpen,
                                                     CancellationToken ct)
    {
        if(trip.Status != 3) return Detection.Inactive;

        var gps = _gps.Get(trip.DriverId);
        // Sin GPS reciente no sabemos si está parado (lo cubre no_signal).
        if(gps is null || (now - gps.AtUtc).TotalMinutes > s.NoSignalMinutes) return Detection.Unknown;

        // La espera antes de iniciar el viaje no cuenta.
        var stoppedSince = trip.StartedAt.HasValue ? Max(gps.StopSince, trip.StartedAt.Value) : gps.StopSince;
        var stoppedMin = (now - stoppedSince).TotalMinutes;
        if(stoppedMin <= s.LongStopMinutes) return Detection.Inactive;

        var toDest = RouteDeviationService.HaversineMeters(gps.Lat, gps.Lng, trip.DestLat, trip.DestLng);
        if(toDest <= MonitorAlertRules.NearDestinationM) return Detection.Inactive;

        // Parado en una parada intermedia del viaje: no es alerta. Si ya está
        // abierta, el lugar no cambió (sigue detenido ahí), no hace falta revisar.
        if(!alreadyOpen)
        {
            var waypoints = await _trips.GetWaypointsAsync(trip.TripId, ct);
            if(waypoints.Any(w => RouteDeviationService.HaversineMeters(gps.Lat, gps.Lng, w.Lat, w.Lng)
                                  <= MonitorAlertRules.NearDestinationM))
                return Detection.Inactive;
        }

        var minutes = (int)Math.Floor(stoppedMin);
        return new Detection(State.Active, minutes,
            new
            {
                minutes,
                thresholdMin = s.LongStopMinutes,
                lat = gps.StopLat,
                lng = gps.StopLng,
                distanceToDestM = Math.Round(toDest),
            },
            "Detenido",
            $"Detenido: {driver} lleva {minutes} min parado en pleno viaje");
    }

    private async Task<Detection> CheckTripDelayedAsync(MonitorTripSnapshot trip, MonitorAlertSettings s,
                                                        DateTime now, string driver, CancellationToken ct)
    {
        if(trip.Status != 3 || trip.StartedAt is null) return Detection.Inactive;

        var elapsed = (now - trip.StartedAt.Value).TotalMinutes;
        var (estimate, source) = await EstimateMinutesAsync(trip, ct);
        var limit = Math.Max(estimate * (1 + s.TripDelayPct / 100.0), estimate + MonitorAlertRules.MinDelayMinutes);
        if(elapsed <= limit) return Detection.Inactive;

        var minutes = (int)Math.Floor(elapsed);
        var estimated = (int)Math.Round(estimate);
        return new Detection(State.Active, minutes,
            new
            {
                minutes,
                estimatedMin = estimated,
                estimateSource = source,
                delayPct = s.TripDelayPct,
                limitMin = (int)Math.Ceiling(limit),
            },
            "Viaje demorado",
            $"Viaje demorado: {driver} lleva {minutes} min (estimado {estimated})");
    }

    /// <summary>
    /// Duración estimada del viaje (min): ruta planificada (distancia a 22 km/h),
    /// si no GraphHopper (origen → paradas → destino), si no distancia a 22 km/h.
    /// </summary>
    private async Task<(double Minutes, string Source)> EstimateMinutesAsync(MonitorTripSnapshot trip,
                                                                             CancellationToken ct)
    {
        if(trip.PlannedDistanceM is > 0)
            return (MinutesAtUrbanSpeed(trip.PlannedDistanceM.Value), "planned_route");

        var now = DateTime.UtcNow;
        if(_estimates.TryGetValue(trip.TripId, out var c))
        {
            var ttl = c.Source == "graphhopper" ? EstimateTtl : FallbackEstimateTtl;
            if(now - c.At < ttl) return (c.Minutes, c.Source);
        }

        var stops = new List<(double Lat, double Lng)> { (trip.OriginLat, trip.OriginLng) };
        var waypoints = await _trips.GetWaypointsAsync(trip.TripId, ct);
        stops.AddRange(waypoints.OrderBy(w => w.SortOrder).Select(w => (w.Lat, w.Lng)));
        stops.Add((trip.DestLat, trip.DestLng));

        double seconds = 0;
        var ok = true;
        for(int i = 0; i < stops.Count - 1 && ok; i++)
        {
            var res = await _routing.GetRouteAsync(stops[i].Lat, stops[i].Lng, stops[i + 1].Lat, stops[i + 1].Lng, ct);
            if(res is null || res.DurationSeconds <= 0) ok = false;
            else seconds += res.DurationSeconds;
        }

        (double Minutes, string Source) result;
        if(ok)
        {
            result = (seconds / 60.0, "graphhopper");
        }
        else
        {
            double meters = trip.DistanceKm is > 0 ? trip.DistanceKm.Value * 1000 : 0;
            if(meters <= 0)
                for(int i = 0; i < stops.Count - 1; i++)
                    meters += RouteDeviationService.HaversineMeters(stops[i].Lat, stops[i].Lng,
                                                                   stops[i + 1].Lat, stops[i + 1].Lng);
            result = (MinutesAtUrbanSpeed(meters), "distance");
        }

        _estimates[trip.TripId] = (result.Minutes, result.Source, now);
        return result;
    }

    private static double MinutesAtUrbanSpeed(double meters) =>
        meters / 1000.0 / MonitorAlertRules.UrbanSpeedKmh * 60.0;

    // ── Abrir / actualizar / resolver ─────────────────────────────────────

    private async Task ApplyAsync(MonitorTripSnapshot trip, string type, Detection d,
                                  Dictionary<(Guid, string), MonitorAlert> openByKey, CancellationToken ct)
    {
        openByKey.TryGetValue((trip.TripId, type), out var existing);
        switch(d.State)
        {
            case State.Unknown:
                return;

            case State.Inactive:
                if(existing is not null) await ResolveAsync(existing, ct);
                return;

            case State.Active:
                var details = JsonSerializer.Serialize(d.Details, Json);
                if(existing is not null)
                {
                    await _repo.TouchAsync(existing.Id, details, ct);
                    return;
                }
                var alert = await _repo.OpenAsync(trip.TripId, trip.DriverId, type, details, ct);
                if(alert is null) return; // otra pasada la abrió al mismo tiempo
                openByKey[(trip.TripId, type)] = alert;
                await _notifier.NotifyMonitorAlertAsync(alert, d.Title!, d.Message!, d.Minutes, ct);
                return;
        }
    }

    private async Task ResolveAsync(MonitorAlert alert, CancellationToken ct)
    {
        if(await _repo.ResolveAsync(alert.Id, ct))
            await _notifier.NotifyMonitorAlertResolvedAsync(alert, ct);
    }

    private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
}
