using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Commands;

/// <summary>
/// Cancelar un viaje. CancelledBy = quien cancela de verdad:
/// "passenger" | "driver" | "admin" (lo decide el controller por el usuario).
/// </summary>
public record CancelTripCommand(Guid TripId, string CancelledBy = "passenger", string? Reason = null)
    : IRequest<TripDto>;
