using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;
using Bugie.Rewards.Domain.Common;

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
        var ahoraLocal  = BugieTime.Now;
        var inicioMes   = new DateTime(ahoraLocal.Year, ahoraLocal.Month, 1);
        var inicioMesUtc = BugieTime.PeruToUtc(inicioMes);

        var total = 0;

        // Los niveles son los mismos para todos los sorteos: una sola consulta.
        var niveles = await _levels.GetAllAsync(ct);

        foreach (var raffle in abiertos)
        {
            if (ct.IsCancellationRequested) break;

            var candidatos = await _candidates.GetCandidatesAsync(
                raffle.TargetUserType, inicioMesUtc, ct);

            // Lo que ya tiene cada usuario, en una consulta. Sirve para saltar
            // a quien ya está completo sin abrir una transacción; a quien le
            // falta, GrantMissingTicketsAsync vuelve a contar con el sorteo
            // bloqueado (así dos mantenimientos a la vez no duplican).
            var yaTienen = await _raffles.CountTicketsByUserAsync(raffle.Id, ct);
            int Tiene(Guid userId, string source) => yaTienen.GetValueOrDefault((userId, source));

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
                if (porNivel > Tiene(c.UserId, TicketSources.LevelBenefit))
                    entregados += await _raffles.GrantMissingTicketsAsync(
                        raffle.Id, c.UserId, c.ProfileId, porNivel,
                        TicketSources.LevelBenefit, ct);

                // 2. Tickets por puntos acumulados en el mes.
                if (options.RafflePointsPerTicket > 0)
                {
                    var merece = c.PointsEarnedThisMonth / options.RafflePointsPerTicket;
                    if (merece > Tiene(c.UserId, TicketSources.MonthlyPoints))
                        entregados += await _raffles.GrantMissingTicketsAsync(
                            raffle.Id, c.UserId, c.ProfileId, merece,
                            TicketSources.MonthlyPoints, ct);
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

        foreach (var pendiente in pendientes)
        {
            if (ct.IsCancellationRequested) break;

            // Bajo el bloqueo del sorteo: si "Sortear ahora" se adelantó (o lo
            // cancelaron), aquí no se vuelve a sortear ni a avisar.
            var r = await _raffles.DrawAsync(
                pendiente.Id, RaffleWinnerPicker.Pick, cancelIfNoTickets: true, ct);

            if (r.Outcome == RaffleDrawOutcome.NoTickets)
            {
                mensajes.Add($"{pendiente.Name}: sin participantes, se canceló.");
                continue;
            }
            if (r.Outcome != RaffleDrawOutcome.Drawn) continue;

            var raffle  = r.Raffle!;
            var winners = r.Winners;

            mensajes.Add(
                $"{raffle.Name}: sorteado con {r.Tickets} tickets, " +
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
