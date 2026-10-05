using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetRafflesHandler : IRequestHandler<GetRafflesQuery, List<RaffleDto>>
{
    private readonly IRaffleRepository _raffles;
    private readonly IUserDirectory    _users;
    public GetRafflesHandler(IRaffleRepository raffles, IUserDirectory users)
        => (_raffles, _users) = (raffles, users);

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

        // Nombre y rol de los ganadores (para entregar o pagar el premio).
        var ids   = salida.SelectMany(s => s.Winners).Select(w => w.UserId);
        var users = await _users.GetByIdsAsync(ids, ct);
        return salida.Select(s => s with
        {
            Winners = s.Winners.Select(w =>
            {
                var u = users.GetValueOrDefault(w.UserId);
                return w with { UserName = u?.FullName, UserRole = u?.Role };
            }).ToList(),
        }).ToList();
    }

    internal static RaffleDto ToDto(Raffle r, int tickets, List<RaffleWinner> winners) => new(
        r.Id, r.Name, r.RaffleType, r.PrizeDescription, r.PrizeValue, r.DrawDate,
        r.MinLevelRequired, r.MinMonthsActive, r.TargetUserType, r.WinnersCount,
        r.Status, r.DrawnAt, r.TicketsAtDraw, r.DrawSeed, tickets,
        winners.Select(w => new RaffleWinnerDto(
            w.Id, w.UserId, w.TicketNumber, w.PrizeRank, w.PrizeDetail,
            w.Status, w.DeliveredAt, w.Note, PrizeCode: w.PrizeCode)).ToList());
}
