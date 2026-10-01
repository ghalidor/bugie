using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

/// <summary>Admin: crea o edita un sorteo. Id null = crear.</summary>
public record UpsertRaffleCommand(Guid? Id, RaffleInput Input) : IRequest<RaffleDto>;

public class UpsertRaffleHandler : IRequestHandler<UpsertRaffleCommand, RaffleDto>
{
    private readonly IRaffleRepository      _raffles;
    private readonly IRewardLevelRepository _levels;

    public UpsertRaffleHandler(IRaffleRepository raffles, IRewardLevelRepository levels)
    {
        _raffles = raffles;
        _levels  = levels;
    }

    public async Task<RaffleDto> Handle(UpsertRaffleCommand cmd, CancellationToken ct)
    {
        var i = cmd.Input;
        await ValidateAsync(i, ct);

        Raffle raffle;
        var now = DateTime.UtcNow;

        if (cmd.Id is null)
        {
            raffle = new Raffle { Id = Guid.NewGuid(), CreatedAt = now };
        }
        else
        {
            raffle = await _raffles.GetByIdAsync(cmd.Id.Value, ct)
                ?? throw new KeyNotFoundException("Sorteo no encontrado.");

            if (raffle.Status == RaffleStatus.Drawn)
                throw new InvalidOperationException(
                    "Este sorteo ya se ejecutó. No se puede modificar sin invalidar el resultado.");
        }

        raffle.Name             = i.Name.Trim();
        raffle.RaffleType       = i.RaffleType;
        raffle.PrizeDescription = i.PrizeDescription.Trim();
        raffle.PrizeValue       = i.PrizeValue;
        raffle.DrawDate         = i.DrawDate;
        raffle.MinLevelRequired = string.IsNullOrWhiteSpace(i.MinLevelRequired) ? null : i.MinLevelRequired;
        raffle.MinMonthsActive  = i.MinMonthsActive is > 0 ? i.MinMonthsActive : null;
        raffle.TargetUserType   = i.TargetUserType;
        raffle.WinnersCount     = i.WinnersCount;
        raffle.Status           = i.Open ? RaffleStatus.Open : RaffleStatus.Closed;
        raffle.UpdatedAt        = now;

        if (cmd.Id is null) await _raffles.AddAsync(raffle, ct);
        else                await _raffles.UpdateAsync(raffle, ct);

        var tickets = await _raffles.CountTicketsAsync(raffle.Id, ct);
        return GetRafflesHandler.ToDto(raffle, tickets, new List<RaffleWinner>());
    }

    private async Task ValidateAsync(RaffleInput i, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(i.Name))
            throw new ArgumentException("El nombre es requerido.");

        if (string.IsNullOrWhiteSpace(i.PrizeDescription))
            throw new ArgumentException("Describe el premio.");

        if (i.RaffleType is not (RaffleTypes.Weekly or RaffleTypes.Monthly or RaffleTypes.Special))
            throw new ArgumentException("El tipo debe ser semanal, mensual o especial.");

        if (i.TargetUserType is not ("passenger" or "driver" or "both"))
            throw new ArgumentException("El destinatario debe ser pasajeros, conductores o ambos.");

        if (i.WinnersCount is < 1 or > 50)
            throw new ArgumentException("La cantidad de ganadores debe estar entre 1 y 50.");

        if (i.DrawDate <= DateTime.UtcNow.AddMinutes(-1))
            throw new ArgumentException("La fecha del sorteo debe ser futura.");

        if (!string.IsNullOrWhiteSpace(i.MinLevelRequired))
        {
            var niveles = await _levels.GetAllAsync(ct);
            if (niveles.All(l => l.Name != i.MinLevelRequired))
                throw new ArgumentException($"El nivel '{i.MinLevelRequired}' no existe.");
        }
    }
}

/// <summary>Admin: borra un sorteo que todavía no se ejecutó.</summary>
public record DeleteRaffleCommand(Guid Id) : IRequest<Unit>;

public class DeleteRaffleHandler : IRequestHandler<DeleteRaffleCommand, Unit>
{
    private readonly IRaffleRepository _raffles;
    public DeleteRaffleHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<Unit> Handle(DeleteRaffleCommand cmd, CancellationToken ct)
    {
        var raffle = await _raffles.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Sorteo no encontrado.");

        if (raffle.Status == RaffleStatus.Drawn)
            throw new InvalidOperationException(
                "Un sorteo ya ejecutado no se borra: se perdería el registro del ganador.");

        // Los tickets se van con él por la clave foránea.
        await _raffles.DeleteAsync(cmd.Id, ct);
        return Unit.Value;
    }
}

/// <summary>Admin: ejecuta un sorteo ahora, sin esperar a su fecha.</summary>
public record DrawRaffleNowCommand(Guid Id) : IRequest<RaffleDto>;

public class DrawRaffleNowHandler : IRequestHandler<DrawRaffleNowCommand, RaffleDto>
{
    private readonly IRaffleRepository _raffles;
    public DrawRaffleNowHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<RaffleDto> Handle(DrawRaffleNowCommand cmd, CancellationToken ct)
    {
        var raffle = await _raffles.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Sorteo no encontrado.");

        if (raffle.Status == RaffleStatus.Drawn)
            throw new InvalidOperationException("Este sorteo ya se ejecutó.");

        var tickets = await _raffles.GetTicketsAsync(raffle.Id, ct);
        if (tickets.Count == 0)
            throw new InvalidOperationException(
                "No hay tickets repartidos todavía. Ejecuta el mantenimiento primero.");

        var seed      = raffle.DrawSeed ?? RaffleDraw.NewSeed();
        var ganadores = RaffleDraw.Draw(tickets, seed, raffle.WinnersCount);

        raffle.DrawSeed      = seed;
        raffle.DrawnAt       = DateTime.UtcNow;
        raffle.TicketsAtDraw = tickets.Count;
        raffle.Status        = RaffleStatus.Drawn;
        raffle.UpdatedAt     = DateTime.UtcNow;

        var winners = ganadores.Select(g => new RaffleWinner
        {
            Id           = Guid.NewGuid(),
            RaffleId     = raffle.Id,
            UserId       = g.UserId,
            TicketNumber = g.TicketNumber,
            PrizeRank    = g.PrizeRank,
            PrizeDetail  = g.PrizeRank == 1 ? raffle.PrizeDescription : $"Premio secundario #{g.PrizeRank}",
            Status       = "pending",
            CreatedAt    = DateTime.UtcNow,
        }).ToList();

        await _raffles.SaveDrawAsync(raffle, winners, ct);
        return GetRafflesHandler.ToDto(raffle, tickets.Count, winners);
    }
}

/// <summary>Admin: marca un premio como entregado.</summary>
public record DeliverPrizeCommand(Guid WinnerId, Guid? AdminId, string? Note) : IRequest<Unit>;

public class DeliverPrizeHandler : IRequestHandler<DeliverPrizeCommand, Unit>
{
    private readonly IRaffleRepository _raffles;
    public DeliverPrizeHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<Unit> Handle(DeliverPrizeCommand cmd, CancellationToken ct)
    {
        var winner = await _raffles.GetWinnerByIdAsync(cmd.WinnerId, ct)
            ?? throw new KeyNotFoundException("Ganador no encontrado.");

        if (winner.Status == "delivered")
            throw new InvalidOperationException("Este premio ya figura como entregado.");

        winner.Status      = "delivered";
        winner.DeliveredAt = DateTime.UtcNow;
        winner.DeliveredBy = cmd.AdminId;
        winner.Note        = cmd.Note;

        await _raffles.UpdateWinnerAsync(winner, ct);
        return Unit.Value;
    }
}

/// <summary>
/// Comprueba que el ganador salió realmente de la semilla guardada.
/// Cualquiera con la semilla y la lista de tickets puede repetir este cálculo.
/// </summary>
public record VerifyRaffleCommand(Guid Id) : IRequest<RaffleVerification>;

public record RaffleVerification(
    bool    Matches,
    string? Seed,
    string? SeedHash,
    int     TicketCount,
    IReadOnlyList<string> RecalculatedTickets,
    IReadOnlyList<string> StoredTickets);

public class VerifyRaffleHandler : IRequestHandler<VerifyRaffleCommand, RaffleVerification>
{
    private readonly IRaffleRepository _raffles;
    public VerifyRaffleHandler(IRaffleRepository raffles) => _raffles = raffles;

    public async Task<RaffleVerification> Handle(VerifyRaffleCommand cmd, CancellationToken ct)
    {
        var raffle = await _raffles.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Sorteo no encontrado.");

        if (raffle.Status != RaffleStatus.Drawn || string.IsNullOrWhiteSpace(raffle.DrawSeed))
            throw new InvalidOperationException("Este sorteo todavía no se ejecutó.");

        var tickets   = await _raffles.GetTicketsAsync(raffle.Id, ct);
        var guardados = (await _raffles.GetWinnersAsync(raffle.Id, ct))
            .OrderBy(w => w.PrizeRank).Select(w => w.TicketNumber).ToList();

        var recalculados = RaffleDraw
            .Draw(tickets, raffle.DrawSeed!, raffle.WinnersCount)
            .Select(w => w.TicketNumber).ToList();

        return new RaffleVerification(
            recalculados.SequenceEqual(guardados),
            raffle.DrawSeed,
            RaffleDraw.PublishableCommitment(raffle.DrawSeed!),
            tickets.Count,
            recalculados,
            guardados);
    }
}
