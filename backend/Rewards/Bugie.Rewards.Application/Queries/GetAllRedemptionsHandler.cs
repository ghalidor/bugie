using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetAllRedemptionsHandler
    : IRequestHandler<GetAllRedemptionsQuery, PagedResult<RedemptionDto>>
{
    private readonly IRedemptionRepository _redemptions;
    public GetAllRedemptionsHandler(IRedemptionRepository r) => _redemptions = r;

    public async Task<PagedResult<RedemptionDto>> Handle(
        GetAllRedemptionsQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);

        var (items, total) = await _redemptions.GetPagedAsync(
            q.Status, q.UserType, page, pageSize, ct);

        return new PagedResult<RedemptionDto>(
            items.Select(GetMyRedemptionsHandler.ToDto).ToList(), total, page, pageSize);
    }
}
