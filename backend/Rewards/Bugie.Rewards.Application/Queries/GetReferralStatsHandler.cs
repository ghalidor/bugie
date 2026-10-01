using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetReferralStatsHandler
    : IRequestHandler<GetReferralStatsQuery, ReferralStatsDto>
{
    private readonly IReferralRepository _referrals;
    public GetReferralStatsHandler(IReferralRepository referrals) => _referrals = referrals;

    public async Task<ReferralStatsDto> Handle(GetReferralStatsQuery q, CancellationToken ct)
    {
        var (total, qualified, points, codes, sent, accepted) =
            await _referrals.GetStatsAsync(ct);

        var top = await _referrals.GetTopReferrersAsync(20, ct);

        return new ReferralStatsDto(
            total, qualified, total - qualified, points,
            codes, sent, accepted,
            top.Select(t => new TopReferrerDto(
                t.UserId, t.FullName, t.Email,
                t.Invited, t.Qualified, t.PointsEarned, t.LastAt)).ToList());
    }
}
