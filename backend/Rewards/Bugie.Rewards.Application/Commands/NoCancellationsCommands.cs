using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

public record NoCancelResult(int Awarded, int Points, int DriversChecked, string? Reason);

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

        // Por defecto, el día de ayer en hora local.
        var dia = cmd.LocalDate?.Date
                  ?? DateTime.UtcNow.AddHours(options.TimezoneOffsetHours).Date.AddDays(-1);

        var stats = await _trips.GetDriverDayAsync(dia, ct);
        if (stats is null)
            return new NoCancelResult(0, 0, 0, "Trips no respondió. Se reintenta mañana.");

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

            // El índice único decide: si ya se pagó ese día, no se repite.
            if (!await _milestones.TryAwardAsync(award, ct)) continue;

            await CreditAsync(profile, options, award.Points,
                $"{d.Completed} viajes sin cancelar", ct);
            pagados++;
        }

        return new NoCancelResult(
            pagados, pagados * options.NoCancelPoints, stats.Count, null);
    }

    private async Task CreditAsync(
        PointsProfile profile, RewardsOptions options, int points,
        string nota, CancellationToken ct)
    {
        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(profile.UserType));

        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        points,
            sourceEvent:   SourceEvents.NoCancellations,
            referenceId:   null,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        await _profiles.ApplyEarnAsync(profile, movement, ct);
    }
}
