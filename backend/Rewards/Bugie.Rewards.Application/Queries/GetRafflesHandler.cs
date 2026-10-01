using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetRafflesHandler : IRequestHandler<GetRafflesQuery, List<RaffleDto>>
{
    private readonly IRaffleRepository _raffles;
    public GetRafflesHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<List<RaffleDto>> Handle(GetRafflesQuery q, CancellationToken ct)
    {
        var lista = await _raffles.GetAllAsync(ct);
        var salida = new List<RaffleDto>();

        foreach (var r in lista)
        {
            var winners = await _raffles.GetWinnersAsync(r.Id, ct);
            var tickets = await _raffles.CountTicketsAsync(r.Id, ct);
            salida.Add(ToDto(r, tickets, winners));
        }

        return salida;
    }

    internal static RaffleDto ToDto(Raffle r, int tickets, List<RaffleWinner> winners) => new(
        r.Id, r.Name, r.RaffleType, r.PrizeDescription, r.PrizeValue, r.DrawDate,
        r.MinLevelRequired, r.MinMonthsActive, r.TargetUserType, r.WinnersCount,
        r.Status, r.DrawnAt, r.TicketsAtDraw, r.DrawSeed, tickets,
        winners.Select(w => new RaffleWinnerDto(
            w.Id, w.UserId, w.TicketNumber, w.PrizeRank, w.PrizeDetail,
            w.Status, w.DeliveredAt, w.Note)).ToList());
}

public class GetMyRafflesHandler : IRequestHandler<GetMyRafflesQuery, List<MyRaffleDto>>
{
    private readonly IRaffleRepository _raffles;
    public GetMyRafflesHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<List<MyRaffleDto>> Handle(GetMyRafflesQuery q, CancellationToken ct)
    {
        var resumen = await _raffles.GetUserTicketsSummaryAsync(q.UserId, ct);
        var ganados = await _raffles.GetWinnersByUserAsync(q.UserId, ct);

        return resumen.Select(x =>
        {
            var premio = ganados.FirstOrDefault(w => w.RaffleId == x.Raffle.Id);
            return new MyRaffleDto(
                x.Raffle.Id, x.Raffle.Name, x.Raffle.RaffleType,
                x.Raffle.PrizeDescription, x.Raffle.DrawDate, x.Raffle.Status,
                x.Tickets, premio is not null, premio?.PrizeRank);
        }).ToList();
    }
}
