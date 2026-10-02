using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetAllRedemptionsHandler
    : IRequestHandler<GetAllRedemptionsQuery, PagedResult<RedemptionDto>>
{
    private readonly IRedemptionRepository _redemptions;
    private readonly IUserDirectory        _users;
    public GetAllRedemptionsHandler(IRedemptionRepository r, IUserDirectory users)
        => (_redemptions, _users) = (r, users);

    public async Task<PagedResult<RedemptionDto>> Handle(
        GetAllRedemptionsQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);

        var (items, total) = await _redemptions.GetPagedAsync(
            q.Status, q.UserType, page, pageSize, ct);

        // Nombre y rol de quien canjeo: el admin necesita saber a quien entregar o pagar.
        var users = await _users.GetByIdsAsync(items.Select(i => i.UserId), ct);
        var dtos = items.Select(i =>
        {
            var u = users.GetValueOrDefault(i.UserId);
            return GetMyRedemptionsHandler.ToDto(i) with { UserName = u?.FullName, UserRole = u?.Role };
        }).ToList();

        return new PagedResult<RedemptionDto>(dtos, total, page, pageSize);
    }
}
