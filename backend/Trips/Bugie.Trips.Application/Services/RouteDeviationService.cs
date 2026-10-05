using System.Globalization;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Services;

/// <summary>
/// Deteccion de desvio de ruta en el backend.
///
/// Se llama en cada GPS del conductor (Drivers.Api -> /api/internal/notify/driver-location):
///   1. Si el viaje esta aceptado, guarda la ruta "hacia el recojo" (conductor -> origen).
///      Ese tramo no se vigila: solo queda registrado.
///   2. Si el viaje esta en curso, usa la ruta "en viaje" (origen -> paradas -> destino);
///      si aun no existe la calcula con GraphHopper (o linea recta si no responde).
///   3. Mide la distancia del punto a la ruta. Si supera el umbral
///      (setting deviation_threshold_m) en 2 lecturas seguidas, abre una alerta,
///      avisa al admin por SignalR y manda push al pasajero.
///      Mientras siga desviado no se repite la alerta; cuando vuelve a la ruta se cierra.
///
/// Todo depende del setting deviation_detection_enabled (Landing).
/// </summary>
public class RouteDeviationService
{
    /// <summary>Lecturas GPS seguidas fuera de la ruta para abrir la alerta.</summary>
    public const int ReadingsToAlert = 2;
    public const double DefaultThresholdM = 300;

    private readonly ITripRepository _trips;
    private readonly IRouteDeviationRepository _repo;
    private readonly IRoutingService _routing;
    private readonly ILandingClient _landing;
    private readonly IAdminNotifier _notifier;
    private readonly ITripNotificationService _push;

    public RouteDeviationService(ITripRepository trips,
                                 IRouteDeviationRepository repo,
                                 IRoutingService routing,
                                 ILandingClient landing,
                                 IAdminNotifier notifier,
                                 ITripNotificationService push)
    {
        _trips = trips;
        _repo = repo;
        _routing = routing;
        _landing = landing;
        _notifier = notifier;
        _push = push;
    }

    public async Task ProcessDriverLocationAsync(Guid driverUserId, double lat, double lng,
                                                 bool hasActiveTrip, CancellationToken ct = default)
    {
        if(!hasActiveTrip)
        {
            // Sin viaje: cerramos alertas que hayan quedado abiertas.
            await CloseEndedTripsAsync(driverUserId, ct);
            return;
        }

        if(!await IsEnabledAsync(ct)) return;

        var trip = await _trips.GetActiveTripAsync(driverUserId, ct);
        if(trip is null || trip.DriverId != driverUserId)
        {
            await CloseEndedTripsAsync(driverUserId, ct);
            return;
        }

        // Tramo hacia el recojo: solo se guarda la ruta (primera lectura tras aceptar).
        if(trip.Status == TripStatus.Accepted)
        {
            var pickup = await _repo.GetPlannedRouteAsync(trip.Id, TripPlannedRoute.LegPickup, ct);
            if(pickup is null)
                await CreatePlannedRouteAsync(trip.Id, TripPlannedRoute.LegPickup,
                    new List<(double, double)> { (lat, lng), (trip.OriginLat, trip.OriginLng) }, ct);
            return;
        }

        var inTrip = trip.Status == TripStatus.InProgress
                  || (trip.Status == TripStatus.SosActive && trip.StartedAt.HasValue);
        if(!inTrip) return;

        var route = await _repo.GetPlannedRouteAsync(trip.Id, TripPlannedRoute.LegTrip, ct)
                    ?? await CreateTripRouteAsync(trip, ct);
        if(route is null || route.Points.Count == 0) return;

        var threshold = await GetThresholdAsync(ct);
        var dist = DistanceToRouteMeters(lat, lng, route.Points);
        var open = await _repo.GetOpenByTripAsync(trip.Id, ct);

        if(dist > threshold)
        {
            var streak = route.OffRouteStreak + 1;
            await _repo.SetOffRouteStreakAsync(route.Id, streak, ct);

            // Ya hay alerta abierta: solo actualizamos la distancia maxima.
            if(open is not null)
            {
                await _repo.UpdateMaxDistanceAsync(open.Id, Math.Round(dist), ct);
                return;
            }
            if(streak < ReadingsToAlert) return;

            var deviation = new RouteDeviation
            {
                Id = Guid.NewGuid(),
                TripId = trip.Id,
                DriverId = driverUserId,
                Leg = TripPlannedRoute.LegTrip,
                Lat = lat,
                Lng = lng,
                DistanceM = Math.Round(dist),
                MaxDistanceM = Math.Round(dist),
            };
            if(!await _repo.AddAsync(deviation, ct)) return;

            await _notifier.NotifyRouteDeviationAsync(deviation, "new", ct);
            await _push.NotifyPassengerRouteDeviationAsync(trip.PassengerId, trip.Id, trip.ServiceType);
        }
        else
        {
            if(route.OffRouteStreak != 0)
                await _repo.SetOffRouteStreakAsync(route.Id, 0, ct);

            // Volvio a la ruta: cerramos la alerta.
            if(open is not null)
            {
                await _repo.CloseAsync(open.Id, "back_on_route", ct);
                open.Status = RouteDeviation.StatusClosed;
                open.CloseReason = "back_on_route";
                open.EndedAt = DateTime.UtcNow;
                await _notifier.NotifyRouteDeviationAsync(open, "closed", ct);
            }
        }
    }

    /// <summary>
    /// El admin marca la alerta como revisada con una nota.
    /// Devuelve la alerta actualizada, o null si no existe o ya estaba revisada.
    /// </summary>
    public async Task<RouteDeviation?> ReviewAsync(Guid deviationId, Guid adminUserId, string note,
                                                   CancellationToken ct = default)
    {
        if(!await _repo.ReviewAsync(deviationId, adminUserId, note, ct)) return null;
        var d = await _repo.GetByIdAsync(deviationId, ct);
        if(d is not null) await _notifier.NotifyRouteDeviationAsync(d, "reviewed", ct);
        return d;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private async Task CloseEndedTripsAsync(Guid driverUserId, CancellationToken ct)
    {
        var closed = await _repo.CloseOpenForEndedTripsAsync(driverUserId, ct);
        foreach(var d in closed)
            await _notifier.NotifyRouteDeviationAsync(d, "closed", ct);
    }

    private async Task<bool> IsEnabledAsync(CancellationToken ct)
    {
        var v = (await _landing.GetSettingAsync("deviation_detection_enabled", ct))?.Trim();
        return v is not null && (v.Equals("true", StringComparison.OrdinalIgnoreCase) || v == "1");
    }

    private async Task<double> GetThresholdAsync(CancellationToken ct)
    {
        var v = await _landing.GetSettingAsync("deviation_threshold_m", ct);
        if(double.TryParse(v, NumberStyles.Any, CultureInfo.InvariantCulture, out var m) && m >= 50)
            return m;
        return DefaultThresholdM;
    }

    /// <summary>Ruta "en viaje": origen -> paradas (en orden) -> destino.</summary>
    private async Task<TripPlannedRoute?> CreateTripRouteAsync(Trip trip, CancellationToken ct)
    {
        var stops = new List<(double, double)> { (trip.OriginLat, trip.OriginLng) };
        var waypoints = await _trips.GetWaypointsAsync(trip.Id, ct);
        stops.AddRange(waypoints.OrderBy(w => w.SortOrder).Select(w => (w.Lat, w.Lng)));
        stops.Add((trip.DestLat, trip.DestLng));

        await CreatePlannedRouteAsync(trip.Id, TripPlannedRoute.LegTrip, stops, ct);
        // Releemos: si otra lectura la guardo al mismo tiempo, usamos esa.
        return await _repo.GetPlannedRouteAsync(trip.Id, TripPlannedRoute.LegTrip, ct);
    }

    /// <summary>
    /// Calcula la ruta tramo a tramo con GraphHopper. Si un tramo falla,
    /// ese tramo queda como linea recta y la ruta se marca 'straight'.
    /// </summary>
    private async Task CreatePlannedRouteAsync(Guid tripId, string leg,
                                               List<(double Lat, double Lng)> stops, CancellationToken ct)
    {
        var points = new List<double[]>();
        double distance = 0;
        var allGraphHopper = true;

        for(int i = 0; i < stops.Count - 1; i++)
        {
            var from = stops[i];
            var to = stops[i + 1];
            var res = await _routing.GetRouteAsync(from.Lat, from.Lng, to.Lat, to.Lng, ct);
            var coords = res?.Options.FirstOrDefault()?.Coordinates;

            if(res is not null && coords is not null && coords.Count > 0)
            {
                distance += res.DistanceMeters;
                // GraphHopper devuelve [lng, lat]; guardamos [lat, lng].
                points.AddRange(coords.Where(c => c.Length >= 2).Select(c => new[] { c[1], c[0] }));
            }
            else
            {
                allGraphHopper = false;
                distance += Haversine(from.Lat, from.Lng, to.Lat, to.Lng);
                points.Add(new[] { from.Lat, from.Lng });
                points.Add(new[] { to.Lat, to.Lng });
            }
        }

        await _repo.SavePlannedRouteAsync(new TripPlannedRoute
        {
            Id = Guid.NewGuid(),
            TripId = tripId,
            Leg = leg,
            Source = allGraphHopper ? "graphhopper" : "straight",
            Points = points,
            DistanceMeters = Math.Round(distance),
        }, ct);
    }

    /// <summary>
    /// Distancia minima (m) de un punto a la ruta (polilinea de [lat, lng]).
    /// Usa proyeccion plana local: suficiente para distancias de ciudad.
    /// </summary>
    public static double DistanceToRouteMeters(double lat, double lng, List<double[]> route)
    {
        if(route.Count == 0) return 0;
        if(route.Count == 1) return Haversine(lat, lng, route[0][0], route[0][1]);

        const double R = 6371000;
        var cosLat = Math.Cos(lat * Math.PI / 180);
        double X(double lo) => R * lo * Math.PI / 180 * cosLat;
        double Y(double la) => R * la * Math.PI / 180;

        double px = X(lng), py = Y(lat);
        var best = double.MaxValue;
        for(int i = 0; i < route.Count - 1; i++)
        {
            double ax = X(route[i][1]), ay = Y(route[i][0]);
            double bx = X(route[i + 1][1]), by = Y(route[i + 1][0]);
            double dx = bx - ax, dy = by - ay;
            var len2 = dx * dx + dy * dy;
            var t = len2 == 0 ? 0 : Math.Clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
            double cx = ax + t * dx, cy = ay + t * dy;
            var d = Math.Sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
            if(d < best) best = d;
        }
        return best;
    }

    private static double Haversine(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371000;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) *
                Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
