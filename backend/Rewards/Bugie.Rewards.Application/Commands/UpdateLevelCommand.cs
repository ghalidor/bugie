using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>Admin: edita un nivel (umbrales y beneficios).</summary>
public record UpdateLevelCommand(
    Guid    Id,
    string  DisplayName,
    int     MinPoints,
    int?    MaxPoints,
    decimal DiscountPercentage,
    int     MonthlyFreeTrips,
    int     WeeklyRaffleTickets,
    int     MonthlyRaffleTickets,
    bool    IsActive,
    // Null = no se envio: se conserva lo que tenia (compatibilidad con el admin anterior).
    int?     MonthlyDiscountCoupons = null,
    // Null con MonthlyFreeTrips > 0 = se conserva el tope actual.
    // Null con MonthlyFreeTrips = 0 = sin tope (no hay viajes gratis).
    decimal? FreeTripMaxAmount      = null) : IRequest<RewardLevelDto>;
