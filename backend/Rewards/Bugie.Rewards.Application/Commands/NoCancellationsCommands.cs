using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;
using Bugie.Rewards.Domain.Common;

namespace Bugie.Rewards.Application.Commands;

/// <param name="DaysProcessed">Días evaluados en esta pasada (se pone al día si quedaron pendientes).</param>
/// <param name="Retry">true si Trips no respondió y quedan días por evaluar.</param>
public record NoCancelResult(
    int Awarded, int Points, int DriversChecked, string? Reason,
    int DaysProcessed = 1, bool Retry = false);

/// <summary>
/// Bono diario para el conductor que trabajó sin cancelar.
///
/// La regla: completó al menos N viajes ese día y no canceló ninguno.
///
/// El mínimo de viajes es lo que hace que la regla premie trabajar bien y no
/// simplemente no trabajar. Sin él, quien se queda en casa tiene cero
/// cancelaciones y cobraría el bono todos los días por no hacer nada.
///
/// Solo cuentan las cancelaciones DEL CONDUCTOR. Si el pasajero se arrepiente,
/// el conductor no hizo nada mal.
///
/// Se evalúa el día ANTERIOR, no el de hoy: un día que todavía está corriendo
/// puede sumar una cancelación más tarde.
/// </summary>
public record AwardNoCancellationsCommand(DateTime? LocalDate = null)
    : IRequest<NoCancelResult>;

public class AwardNoCancellationsHandler
    : IRequestHandler<AwardNoCancellationsCommand, NoCancelResult>
{
    private readonly ITripsStatsClient         _trips;
    private readonly IMilestoneRepository      _milestones;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public AwardNoCancellationsHandler(
        ITripsStatsClient trips,
        IMilestoneRepository milestones,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _trips      = trips;
        _milestones = milestones;
        _profiles   = profiles;
        _levels     = levels;
        _settings   = settings;
    }

    public async Task<NoCancelResult> Handle(
        AwardNoCancellationsCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (options.NoCancelMinTrips <= 0 || options.NoCancelPoints <= 0)
            return new NoCancelResult(0, 0, 0, "La regla está desactivada.");

        // Un día pedido a mano (admin): solo ese día.
        if (cmd.LocalDate is not null)
            return await ProcessDayAsync(cmd.LocalDate.Value.Date, options, ct)
                   ?? new NoCancelResult(0, 0, 0, "Trips no respondió. Se reintenta más tarde.", Retry: true);

        // Automático: todos los días pendientes desde el último evaluado,
        // hasta ayer (hora de Perú) y como mucho MaxCatchUpDays hacia atrás.
        // Si Trips no responde, el día queda pendiente y se retoma cuando
        // vuelva, en vez de perderse.
        var ayer   = BugieTime.Today.AddDays(-1);
        var ultimo = await _milestones.GetLastNoCancelDayAsync(ct);
        var desde  = ultimo is null ? ayer : ultimo.Value.Date.AddDays(1);
        if (desde < ayer.AddDays(-(MaxCatchUpDays - 1)))
            desde = ayer.AddDays(-(MaxCatchUpDays - 1));

        int premiados = 0, puntos = 0, revisados = 0, dias = 0;
        for (var dia = desde; dia <= ayer; dia = dia.AddDays(1))
        {
            if (ct.IsCancellationRequested) break;

            var r = await ProcessDayAsync(dia, options, ct);
            if (r is null)
                return new NoCancelResult(premiados, puntos, revisados,
                    $"Trips no respondió para el {dia:yyyy-MM-dd}. Se reintenta más tarde.",
                    dias, Retry: true);

            premiados += r.Awarded;
            puntos    += r.Points;
            revisados += r.DriversChecked;
            dias++;
        }

        return new NoCancelResult(premiados, puntos, revisados,
            dias == 0 ? "No había días pendientes." : null, dias);
    }

    /// <summary>Máximo de días hacia atrás que se recuperan si Trips estuvo caído.</summary>
    public const int MaxCatchUpDays = 7;

    /// <summary>Evalúa y paga un día. Null si Trips no respondió.</summary>
    private async Task<NoCancelResult?> ProcessDayAsync(
        DateTime dia, RewardsOptions options, CancellationToken ct)
    {
        var stats = await _trips.GetDriverDayAsync(dia, ct);
        if (stats is null) return null;

        var periodo = dia.ToString("yyyy-MM-dd");
        var pagados = 0;

        foreach (var d in stats)
        {
            if (ct.IsCancellationRequested) break;

            if (d.Completed < options.NoCancelMinTrips) continue;
            if (d.CancelledByDriver > 0) continue;

            var profile = await _profiles.GetByUserIdAsync(d.DriverId, ct);
            if (profile is null) continue;   // nunca ganó puntos: nada que premiar

            var award = new MilestoneAward
            {
                ProfileId = profile.Id,
                Type      = MilestoneTypes.NoCancellations,
                PeriodKey = periodo,
                Points    = options.NoCancelPoints,
                Detail    = d.Completed,
            };

            // Logro y abono en una sola transacción; el índice único decide:
            // si ya se pagó ese día, no se repite.
            if (await CreditAsync(profile, options, award,
                    $"{d.Completed} viajes sin cancelar", ct))
                pagados++;
        }

        await _milestones.MarkNoCancelDayAsync(dia, stats.Count, pagados, ct);

        return new NoCancelResult(
            pagados, pagados * options.NoCancelPoints, stats.Count, null);
    }

    private async Task<bool> CreditAsync(
        PointsProfile profile, RewardsOptions options, MilestoneAward award,
        string nota, CancellationToken ct)
    {
        var balanceBefore = profile.AvailablePoints;
        profile.Earn(award.Points, options.ExpiryMonthsFor(profile.UserType));

        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        award.Points,
            sourceEvent:   SourceEvents.NoCancellations,
            referenceId:   null,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        return await _profiles.ApplyMilestoneAsync(profile, movement, award, ct);
    }
}
