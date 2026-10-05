using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Services;

/// <summary>
/// Choques entre programados de un mismo conductor: entre dos horas
/// programadas debe haber al menos ScheduledTrips.ConflictMarginMinutes.
/// </summary>
public static class ScheduledConflicts
{
    /// <summary>
    /// Mensaje de error si el programado choca con otro del conductor, o null si no choca.
    /// Si el viaje no es programado, nunca choca.
    /// </summary>
    public static async Task<string?> FindConflictMessageAsync(
        ITripRepository trips, Guid driverUserId, Trip trip, CancellationToken ct,
        bool forDriver = true)
    {
        if(trip.ScheduledAt is null) return null;
        var other = await trips.GetDriverScheduledConflictAsync(
            driverUserId, trip.ScheduledAt.Value, trip.Id, ScheduledTrips.ConflictMarginMinutes, ct);
        if(other?.ScheduledAt is null) return null;

        var hora = BugieTime.ToPeru(other.ScheduledAt.Value).ToString("dd/MM HH:mm");
        return forDriver
            ? $"Ya tienes otro programado el {hora}. Entre tus programados debe haber al menos 1 hora de diferencia."
            : $"Este conductor ya tiene otro programado el {hora} y no puede tomar el tuyo. Elige otra propuesta.";
    }

    /// <summary>
    /// Mensaje de error si el pasajero ya tiene otro programado propio a menos de
    /// ScheduledTrips.ConflictMarginMinutes de esta hora, o null si no choca.
    /// </summary>
    public static async Task<string?> FindPassengerConflictMessageAsync(
        ITripRepository trips, Guid passengerId, DateTime scheduledAtUtc, CancellationToken ct,
        Guid? exceptTripId = null)
    {
        var other = await trips.GetPassengerScheduledConflictAsync(
            passengerId, scheduledAtUtc, exceptTripId ?? Guid.Empty, ScheduledTrips.ConflictMarginMinutes, ct);
        if(other?.ScheduledAt is null) return null;

        var hora = BugieTime.ToPeru(other.ScheduledAt.Value).ToString("dd/MM HH:mm");
        return $"Ya tienes otro programado el {hora}. Entre tus programados debe haber al menos 1 hora de diferencia.";
    }

    /// <summary>Lanza InvalidOperationException (409) si hay choque.</summary>
    public static async Task EnsureNoConflictAsync(
        ITripRepository trips, Guid driverUserId, Trip trip, CancellationToken ct,
        bool forDriver = true)
    {
        var msg = await FindConflictMessageAsync(trips, driverUserId, trip, ct, forDriver);
        if(msg is not null) throw new InvalidOperationException(msg);
    }
}
