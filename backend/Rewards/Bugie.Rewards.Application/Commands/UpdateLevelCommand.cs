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
    bool    IsActive) : IRequest<RewardLevelDto>;
