using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Application.Services;

/// <summary>
/// Hasta cuando sigue la busqueda de conductor de un viaje (vista del pasajero).
/// Mismas reglas que ProposalExpirationService / ScheduledTripReminderService:
///   - programado sin conductor: vence a la hora del viaje ("scheduled_time");
///   - inmediato sin conductor: publicacion + trip_no_driver_cancel_min ("no_driver_timeout").
/// Lo usan POST /api/trips, POST /api/trips/delivery y GET /api/trips/active | /{id}/tracking.
/// </summary>
public static class TripSearchExpiry
{
    public static async Task<TripDto> ApplyAsync(
        TripDto dto, Trip trip, ILandingClient landing, CancellationToken ct)
    {
        if(trip.DriverId is not null ||
           (trip.Status != TripStatus.Pending && trip.Status != TripStatus.Negotiating))
            return dto;

        if(trip.ScheduledAt.HasValue)
            return dto with { ExpiresAt = trip.ScheduledAt.Value, ExpiresReason = "scheduled_time" };

        var rules = await NegotiationRules.LoadAsync(landing, ct);
        var at = rules.NoDriverDeadline(trip);
        return at.HasValue
            ? dto with { ExpiresAt = at.Value, ExpiresReason = "no_driver_timeout" }
            : dto;
    }
}
