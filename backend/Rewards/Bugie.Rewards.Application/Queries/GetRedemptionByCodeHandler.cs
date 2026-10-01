using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetRedemptionByCodeHandler
    : IRequestHandler<GetRedemptionByCodeQuery, RedemptionDto?>
{
    private readonly IRedemptionRepository _redemptions;
    public GetRedemptionByCodeHandler(IRedemptionRepository r) => _redemptions = r;

    public async Task<RedemptionDto?> Handle(GetRedemptionByCodeQuery q, CancellationToken ct)
    {
        var code = (q.Code ?? string.Empty).Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(code)) return null;

        var r = await _redemptions.GetByCodeAsync(code, ct);
        return r is null ? null : GetMyRedemptionsHandler.ToDto(r);
    }
}
