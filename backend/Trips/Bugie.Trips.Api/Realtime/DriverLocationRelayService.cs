using System.Collections.Concurrent;
using Bugie.Trips.Application.Services;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.Extensions.Options;

namespace Bugie.Trips.Api.Realtime;

/// <summary>Ajustes del reenvio de GPS (seccion "LocationRelay" de appsettings; todos con default).</summary>
public class DriverLocationRelayOptions
{
    public const string Section = "LocationRelay";

    /// <summary>Segundos que se recuerda el viaje activo de un conductor sin volver a la base.</summary>
    public int ActiveTripCacheSeconds { get; set; } = 30;
    /// <summary>La revision de desvio corre si el conductor se movio al menos esto...</summary>
    public double DeviationMinMeters { get; set; } = 50;
    /// <summary>...o si pasaron al menos estos segundos desde la ultima revision de ese viaje.</summary>
    public double DeviationMinSeconds { get; set; } = 15;
}

/// <summary>Punto GPS recibido de Drivers.Api (uno o en lote).</summary>
public sealed record DriverLocationPoint(Guid UserId, double Lat, double Lng, bool HasActiveTrip,
                                         double? SpeedKmh = null, double? Heading = null);

/// <summary>
/// Estado en memoria del reenvio (singleton): viaje activo por conductor (cache
/// corto) y ultima revision de desvio por viaje.
/// </summary>
public class DriverLocationRelayState
{
    private readonly ConcurrentDictionary<Guid, (Trip? Trip, DateTime At)> _trips = new();
    private readonly ConcurrentDictionary<Guid, (double Lat, double Lng, DateTime At)> _lastCheck = new();
    private DateTime _lastCleanup = DateTime.UtcNow;

    public async Task<Trip?> GetActiveTripAsync(Guid driverUserId, TimeSpan ttl, Func<Task<Trip?>> load)
    {
        if(_trips.TryGetValue(driverUserId, out var c) && DateTime.UtcNow - c.At < ttl) return c.Trip;
        var trip = await load();
        _trips[driverUserId] = (trip, DateTime.UtcNow);
        return trip;
    }

    /// <summary>Olvida el viaje cacheado (p.ej. el conductor dejo de reportar viaje).</summary>
    public void ForgetTrip(Guid driverUserId) => _trips.TryRemove(driverUserId, out _);

    /// <summary>
    /// true si toca revisar desvio para esta clave (viaje o conductor): primera vez,
    /// se movio al menos minMeters o pasaron al menos minSeconds. Si devuelve true,
    /// ya queda registrado como ultima revision.
    /// </summary>
    public bool ShouldCheckDeviation(Guid key, double lat, double lng, double minMeters, double minSeconds)
    {
        var now = DateTime.UtcNow;
        if(_lastCheck.TryGetValue(key, out var last))
        {
            var moved = RouteDeviationService.HaversineMeters(last.Lat, last.Lng, lat, lng);
            if(moved < minMeters && (now - last.At).TotalSeconds < minSeconds) return false;
        }
        _lastCheck[key] = (lat, lng, now);
        CleanupIfDue(now);
        return true;
    }

    private void CleanupIfDue(DateTime now)
    {
        if(now - _lastCleanup < TimeSpan.FromMinutes(10)) return;
        _lastCleanup = now;
        var cutoff = now - TimeSpan.FromHours(1);
        foreach(var kv in _lastCheck) if(kv.Value.At < cutoff) _lastCheck.TryRemove(kv.Key, out _);
        foreach(var kv in _trips) if(kv.Value.At < cutoff) _trips.TryRemove(kv.Key, out _);
    }
}

/// <summary>
/// Reenvio del GPS del conductor que manda Drivers.Api:
///   * admin (hub /hubs/monitor, "driver:location") y pasajero del viaje
///     (hub /hubs/trips, "DriverLocation") en CADA punto: es barato;
///   * viaje activo del conductor resuelto aqui (no se confia en el tripId del
///     cliente) y recordado ActiveTripCacheSeconds para no ir a la base por punto;
///   * revision de desvio (RouteDeviationService) solo cada DeviationMinMeters o
///     DeviationMinSeconds por viaje.
/// Nada de aqui lanza excepcion hacia el llamador: cada paso se registra en el log.
/// </summary>
public class DriverLocationRelayService
{
    private readonly ITripRepository _trips;
    private readonly IAdminNotifier _admin;
    private readonly ITripRealtimeNotifier _realtime;
    private readonly RouteDeviationService _deviations;
    private readonly DriverLocationRelayState _state;
    private readonly DriverLocationRelayOptions _opts;
    private readonly ILogger<DriverLocationRelayService> _log;

    public DriverLocationRelayService(ITripRepository trips, IAdminNotifier admin,
                                      ITripRealtimeNotifier realtime, RouteDeviationService deviations,
                                      DriverLocationRelayState state,
                                      IOptions<DriverLocationRelayOptions> opts,
                                      ILogger<DriverLocationRelayService> log)
    {
        _trips = trips;
        _admin = admin;
        _realtime = realtime;
        _deviations = deviations;
        _state = state;
        _opts = opts.Value;
        _log = log;
    }

    public async Task RelayAsync(IReadOnlyList<DriverLocationPoint> points, CancellationToken ct)
    {
        var ttl = TimeSpan.FromSeconds(Math.Max(1, _opts.ActiveTripCacheSeconds));

        foreach(var p in points)
        {
            Trip? trip = null;
            if(p.HasActiveTrip)
            {
                try
                {
                    trip = await _state.GetActiveTripAsync(p.UserId, ttl, () => _trips.GetActiveTripAsync(p.UserId, ct));
                }
                catch(Exception ex)
                {
                    _log.LogWarning(ex, "No se pudo resolver el viaje activo del conductor {UserId}.", p.UserId);
                }
            }
            else
            {
                _state.ForgetTrip(p.UserId);
            }
            Guid? tripId = trip is not null && trip.DriverId == p.UserId ? trip.Id : null;

            // Admins: el notificador ya traga sus errores.
            await _admin.NotifyDriverLocationAsync(p.UserId, p.Lat, p.Lng, p.HasActiveTrip, tripId,
                                                   p.Heading, p.SpeedKmh, ct);

            // Pasajero del viaje.
            if(tripId is not null)
            {
                try
                {
                    await _realtime.DriverLocationAsync(tripId.Value, p.Lat, p.Lng, p.Heading, p.SpeedKmh, ct);
                }
                catch(Exception ex)
                {
                    _log.LogWarning(ex, "No se pudo emitir DriverLocation del conductor {UserId}.", p.UserId);
                }
            }

            // Desvio de ruta: solo cada N metros o N segundos por viaje (o por
            // conductor si no tiene viaje: ahi solo cierra alertas viejas).
            if(!_state.ShouldCheckDeviation(tripId ?? p.UserId, p.Lat, p.Lng,
                                            _opts.DeviationMinMeters, _opts.DeviationMinSeconds))
                continue;
            try
            {
                await _deviations.ProcessDriverLocationAsync(p.UserId, p.Lat, p.Lng,
                    p.HasActiveTrip ? trip : null, CancellationToken.None);
            }
            catch(Exception ex)
            {
                _log.LogWarning(ex, "Error al revisar desvio de ruta del conductor {UserId}.", p.UserId);
            }
        }
    }
}
