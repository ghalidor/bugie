using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

public record RaffleMaintenanceResult(
    int TicketsGranted,
    int RafflesDrawn,
    IReadOnlyList<string> Messages);

/// <summary>
/// Mantenimiento de sorteos. Hace dos cosas:
///
///   1. Reparte los tickets que corresponden por nivel en cada sorteo abierto.
///      Corre a diario y no duplica: si el usuario ya los tiene, no pasa nada.
///      Si alguien sube de nivel a mitad de periodo, recibe la diferencia.
///
///   2. Ejecuta los sorteos cuya fecha ya llegó.
///
/// Se puede disparar a mano desde el admin para probar.
/// </summary>
public record RunRaffleMaintenanceCommand(bool DrawDueRaffles = true)
    : IRequest<RaffleMaintenanceResult>;

public class RunRaffleMaintenanceHandler
    : IRequestHandler<RunRaffleMaintenanceCommand, RaffleMaintenanceResult>
{
    private readonly IRaffleRepository            _raffles;
    private readonly IRaffleEligibilityRepository _candidates;
    private readonly IRewardLevelRepository       _levels;
    private readonly IRewardSettingsRepository    _settings;
    private readonly IMediator                    _mediator;

    public RunRaffleMaintenanceHandler(
        IRaffleRepository raffles,
        IRaffleEligibilityRepository candidates,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IMediator mediator)
    {
        _raffles    = raffles;
        _candidates = candidates;
        _levels     = levels;
        _settings   = settings;
        _mediator   = mediator;
    }

    public async Task<RaffleMaintenanceResult> Handle(
        RunRaffleMaintenanceCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var mensajes = new List<string>();

        if (!options.RafflesEnabled)
            return new RaffleMaintenanceResult(0, 0, new[] { "Los sorteos están desactivados." });

        var granted = await GrantLevelTicketsAsync(options, mensajes, ct);

        var drawn = 0;
        if (cmd.DrawDueRaffles)
            drawn = await DrawDueAsync(mensajes, ct);

        return new RaffleMaintenanceResult(granted, drawn, mensajes);
    }

    /* ── Reparto de tickets ──────────────────────────────────────────── */

    private async Task<int> GrantLevelTicketsAsync(
        RewardsOptions options, List<string> mensajes, CancellationToken ct)
    {
        var abiertos = await _raffles.GetOpenAsync(ct);
        if (abiertos.Count == 0) return 0;

        // Inicio del mes local, para contar los puntos del mes.
        var ahoraLocal  = DateTime.UtcNow.AddHours(options.TimezoneOffsetHours);
        var inicioMes   = new DateTime(ahoraLocal.Year, ahoraLocal.Month, 1);
        var inicioMesUtc = inicioMes.AddHours(-options.TimezoneOffsetHours);

        var total = 0;

        foreach (var raffle in abiertos)
        {
            if (ct.IsCancellationRequested) break;

            var niveles    = await _levels.GetAllAsync(ct);
            var candidatos = await _candidates.GetCandidatesAsync(
                raffle.TargetUserType, inicioMesUtc, ct);

            var entregados = 0;

            foreach (var c in candidatos)
            {
                var nivel = niveles.FirstOrDefault(
                    l => l.Name == c.CurrentLevel && l.UserType == c.UserType);
                if (nivel is null) continue;

                // Nivel mínimo exigido por el sorteo.
                if (raffle.MinLevelRequired is not null)
                {
                    var minimo = niveles.FirstOrDefault(
                        l => l.Name == raffle.MinLevelRequired && l.UserType == c.UserType);
                    if (minimo is not null && nivel.SortOrder < minimo.SortOrder) continue;
                }

                // Antigüedad, para el sorteo especial.
                if (raffle.MinMonthsActive is > 0)
                {
                    var meses = (DateTime.UtcNow - c.ProfileCreatedAt).TotalDays / 30.0;
                    if (meses < raffle.MinMonthsActive.Value) continue;
                }

                // 1. Tickets por nivel.
                var porNivel = raffle.TicketsForLevel(nivel);
                if (porNivel > 0)
                {
                    var yaTiene = await _raffles.CountUserTicketsAsync(
                        raffle.Id, c.UserId, TicketSources.LevelBenefit, ct);

                    var faltan = porNivel - yaTiene;
                    if (faltan > 0)
                        entregados += await _raffles.GrantTicketsAsync(
                            raffle.Id, c.UserId, c.ProfileId, faltan,
                            TicketSources.LevelBenefit, null, ct);
                }

                // 2. Tickets por puntos acumulados en el mes.
                if (options.RafflePointsPerTicket > 0)
                {
                    var merece = c.PointsEarnedThisMonth / options.RafflePointsPerTicket;
                    if (merece > 0)
                    {
                        var yaTiene = await _raffles.CountUserTicketsAsync(
                            raffle.Id, c.UserId, TicketSources.MonthlyPoints, ct);

                        var faltan = merece - yaTiene;
                        if (faltan > 0)
                            entregados += await _raffles.GrantTicketsAsync(
                                raffle.Id, c.UserId, c.ProfileId, faltan,
                                TicketSources.MonthlyPoints, null, ct);
                    }
                }
            }

            if (entregados > 0)
                mensajes.Add($"{raffle.Name}: {entregados} tickets entregados.");

            total += entregados;
        }

        return total;
    }

    /* ── Ejecución del sorteo ────────────────────────────────────────── */

    private async Task<int> DrawDueAsync(List<string> mensajes, CancellationToken ct)
    {
        var pendientes = await _raffles.GetDueAsync(ct);
        var hechos = 0;

        foreach (var raffle in pendientes)
        {
            if (ct.IsCancellationRequested) break;

            var tickets = await _raffles.GetTicketsAsync(raffle.Id, ct);

            if (tickets.Count == 0)
            {
                raffle.Status    = RaffleStatus.Cancelled;
                raffle.UpdatedAt = DateTime.UtcNow;
                await _raffles.UpdateAsync(raffle, ct);
                mensajes.Add($"{raffle.Name}: sin participantes, se canceló.");
                continue;
            }

            // Si no se fijó semilla antes, se genera ahora.
            var seed = string.IsNullOrWhiteSpace(raffle.DrawSeed)
                ? RaffleDraw.NewSeed()
                : raffle.DrawSeed!;

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
                PrizeDetail  = g.PrizeRank == 1
                    ? raffle.PrizeDescription
                    : $"Premio secundario #{g.PrizeRank}",
                Status       = "pending",
                CreatedAt    = DateTime.UtcNow,
            }).ToList();

            await _raffles.SaveDrawAsync(raffle, winners, ct);

            mensajes.Add(
                $"{raffle.Name}: sorteado con {tickets.Count} tickets, " +
                $"{winners.Count} ganador(es).");
            hechos++;

            // Aviso a los ganadores (push + bandeja + correo). Nunca rompe el
            // sorteo: si algo falla, queda anotado en los mensajes (al log).
            try
            {
                var avisados = await _mediator.Send(new NotifyRaffleWinnersCommand(raffle.Id), ct);
                if (avisados < winners.Count)
                    mensajes.Add($"{raffle.Name}: se avisó a {avisados} de {winners.Count} ganador(es).");
            }
            catch (Exception ex)
            {
                mensajes.Add($"{raffle.Name}: no se pudo avisar a los ganadores ({ex.Message}).");
            }
        }

        return hechos;
    }
}
