using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetLevelsHandler : IRequestHandler<GetLevelsQuery, List<RewardLevelDto>>
{
    private readonly IRewardLevelRepository _levels;
    public GetLevelsHandler(IRewardLevelRepository levels) => _levels = levels;

    public async Task<List<RewardLevelDto>> Handle(GetLevelsQuery q, CancellationToken ct)
    {
        var levels = string.IsNullOrWhiteSpace(q.UserType)
            ? await _levels.GetAllAsync(ct)
            : await _levels.GetByUserTypeAsync(q.UserType, ct);

        return levels.Select(ToDto).ToList();
    }

    internal static RewardLevelDto ToDto(RewardLevel l) => new(
        l.Id, l.UserType, l.Name, l.DisplayName, l.SortOrder,
        l.MinPoints, l.MaxPoints, l.DiscountPercentage,
        l.MonthlyFreeTrips, l.WeeklyRaffleTickets, l.MonthlyRaffleTickets, l.IsActive,
        l.MonthlyDiscountCoupons, l.FreeTripMaxAmount);
}
