using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Admin: tickets de un sorteo, paginados y con buscador.</summary>
public record GetRaffleTicketsQuery(Guid RaffleId, int Page, int PageSize, string? Search)
    : IRequest<RaffleTicketsPageDto>;

public class GetRaffleTicketsHandler : IRequestHandler<GetRaffleTicketsQuery, RaffleTicketsPageDto>
{
    private const int MaxPageSize = 200;

    private readonly IRaffleRepository _raffles;
    public GetRaffleTicketsHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<RaffleTicketsPageDto> Handle(GetRaffleTicketsQuery q, CancellationToken ct)
    {
        if (await _raffles.GetByIdAsync(q.RaffleId, ct) is null)
            throw new KeyNotFoundException("Sorteo no encontrado.");

        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, MaxPageSize);

        var r = await _raffles.GetTicketsPageAsync(q.RaffleId, q.Search, page, pageSize, ct);

        // Todos los origenes conocidos aparecen (0 si no hay tickets de ese tipo).
        var bySource = new Dictionary<string, int>
        {
            [TicketSources.LevelBenefit]     = 0,
            [TicketSources.MonthlyPoints]    = 0,
            [TicketSources.PointsRedemption] = 0,
            [TicketSources.Promotion]        = 0,
        };
        foreach (var (source, total) in r.BySource) bySource[source] = total;

        return new RaffleTicketsPageDto(
            r.Items.Select(t => new RaffleTicketAdminDto(
                t.TicketNumber, t.UserId, t.UserName, t.UserRole,
                t.Source, t.CreatedAt, t.IsWinner)).ToList(),
            r.Total,
            r.Participants,
            bySource.Values.Sum(),
            bySource);
    }
}
