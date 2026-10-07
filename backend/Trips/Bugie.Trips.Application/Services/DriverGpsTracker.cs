using System.Collections.Concurrent;
using Bugie.Trips.Domain.Common;

namespace Bugie.Trips.Application.Services;

/// <summary>Último GPS de un conductor y desde cuándo está detenido.</summary>
/// <param name="StopSince">Desde cuándo el conductor no se aleja más de
/// MonitorAlertRules.StopRadiusM del punto (StopLat, StopLng).</param>
public sealed record DriverGpsSnapshot(double Lat, double Lng, DateTime AtUtc,
                                       double StopLat, double StopLng, DateTime StopSince);

/// <summary>
/// Memoria (singleton) del GPS que llega a Trips por el reenvío de Drivers.Api
/// (DriverLocationRelayService). La usa MonitorAlertsService para "sin señal"
/// y "detenido". Al reiniciar Trips arranca vacía: el servicio usa entonces
/// drivers.Drivers.CurrentLocationAt y no abre alertas durante la gracia.
/// </summary>
public class DriverGpsTracker
{
    private readonly ConcurrentDictionary<Guid, DriverGpsSnapshot> _last = new();
    private DateTime _lastCleanup = DateTime.UtcNow;

    /// <summary>Registra un punto GPS (hora de recepción, UTC).</summary>
    public void Record(Guid driverUserId, double lat, double lng, DateTime atUtc)
    {
        _last.AddOrUpdate(driverUserId,
            _ => new DriverGpsSnapshot(lat, lng, atUtc, lat, lng, atUtc),
            (_, prev) =>
            {
                if(atUtc < prev.AtUtc) return prev; // punto viejo (lote desordenado)
                var moved = RouteDeviationService.HaversineMeters(prev.StopLat, prev.StopLng, lat, lng);
                return moved > MonitorAlertRules.StopRadiusM
                    ? new DriverGpsSnapshot(lat, lng, atUtc, lat, lng, atUtc)
                    : prev with { Lat = lat, Lng = lng, AtUtc = atUtc };
            });
        CleanupIfDue(atUtc);
    }

    public DriverGpsSnapshot? Get(Guid driverUserId) =>
        _last.TryGetValue(driverUserId, out var s) ? s : null;

    private void CleanupIfDue(DateTime now)
    {
        if(now - _lastCleanup < TimeSpan.FromMinutes(10)) return;
        _lastCleanup = now;
        var cutoff = now - TimeSpan.FromHours(6);
        foreach(var kv in _last) if(kv.Value.AtUtc < cutoff) _last.TryRemove(kv.Key, out _);
    }
}
