using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetMyPointsHistoryHandler
    : IRequestHandler<GetMyPointsHistoryQuery, PagedResult<PointsTransactionDto>>
{
    private readonly IPointsProfileRepository     _profiles;
    private readonly IPointsTransactionRepository _transactions;

    public GetMyPointsHistoryHandler(
        IPointsProfileRepository profiles,
        IPointsTransactionRepository transactions)
    {
        _profiles     = profiles;
        _transactions = transactions;
    }

    public async Task<PagedResult<PointsTransactionDto>> Handle(
        GetMyPointsHistoryQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);

        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);
        if (profile is null)
            return new PagedResult<PointsTransactionDto>(new(), 0, page, pageSize);

        var (items, total) = await _transactions.GetByProfileAsync(profile.Id, page, pageSize, ct);

        var dtos = items.Select(t => new PointsTransactionDto(
            t.Id, t.Type, t.Points, t.SourceEvent, t.ReferenceId,
            t.BalanceAfter, t.ExpiryDate, t.Notes, t.CreatedAt)).ToList();

        return new PagedResult<PointsTransactionDto>(dtos, total, page, pageSize);
    }
}
