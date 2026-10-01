using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetMyRedemptionsHandler
    : IRequestHandler<GetMyRedemptionsQuery, PagedResult<RedemptionDto>>
{
    private readonly IRedemptionRepository _redemptions;
    public GetMyRedemptionsHandler(IRedemptionRepository redemptions) => _redemptions = redemptions;

    public async Task<PagedResult<RedemptionDto>> Handle(
        GetMyRedemptionsQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);

        var (items, total) = await _redemptions.GetByUserAsync(
            q.UserId, q.Status, page, pageSize, ct);

        return new PagedResult<RedemptionDto>(
            items.Select(ToDto).ToList(), total, page, pageSize);
    }

    internal static RedemptionDto ToDto(Redemption r) => new(
        r.Id, r.Code, r.ItemName, r.PointsSpent, r.RewardType,
        r.AmountSoles, r.Quantity, r.Percentage, r.Status,
        r.ExpiresAt, r.UsedAt, r.UsedNote, r.CreatedAt);
}
