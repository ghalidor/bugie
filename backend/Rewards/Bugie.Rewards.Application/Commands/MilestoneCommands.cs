using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

/// <summary>Un logro que se pagó, para contarlo en el resultado.</summary>
public record AwardedMilestone(string Type, int Points, int Detail);

/// <summary>
/// Revisa los logros personales de un usuario después de un viaje.
///
/// Son distintos de las promociones: dependen del historial de CADA persona,
/// no de la hora ni del día. Por eso tienen su propio cálculo y su propia
/// tabla, con un índice único que impide pagar dos veces el mismo periodo.
///
/// Se ejecuta aparte de la acreditación del viaje: si algo falla acá, los
/// puntos del viaje ya quedaron acreditados y no se revierten.
/// </summary>
public record EvaluateMilestonesCommand(Guid UserId, DateTime TripLocalTime)
    : IRequest<List<AwardedMilestone>>;

public class EvaluateMilestonesHandler
    : IRequestHandler<EvaluateMilestonesCommand, List<AwardedMilestone>>
{
    private readonly IMilestoneRepository      _milestones;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public EvaluateMilestonesHandler(
        IMilestoneRepository milestones,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _milestones = milestones;
        _profiles   = profiles;
        _levels     = levels;
        _settings   = settings;
    }

    public async Task<List<AwardedMilestone>> Handle(
        EvaluateMilestonesCommand cmd, CancellationToken ct)
    {
        var pagados = new List<AwardedMilestone>();

        var profile = await _profiles.GetByUserIdAsync(cmd.UserId, ct);
        if (profile is null) return pagados;

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var tz      = options.TimezoneOffsetHours;
        var hoy     = cmd.TripLocalTime.Date;

        // ── Racha de días seguidos ────────────────────────────────────────
        if (options.StreakDays > 0 && options.StreakPoints > 0)
        {
            // Se piden los días justos para medir la racha más larga posible
            // que nos interese, no todo el historial.
            var desde    = hoy.AddDays(-(options.StreakDays * 4));
            var desdeUtc = desde.AddHours(-tz);

            var momentos = await _milestones.GetTripTimesAsync(profile.Id, desdeUtc, ct);
            var diasLocales = momentos.Select(m => m.AddHours(tz).Date);

            var racha = MilestoneRules.CurrentStreak(diasLocales, hoy);

            if (MilestoneRules.CompletesStreakBlock(racha, options.StreakDays))
            {
                var award = new MilestoneAward
                {
                    ProfileId = profile.Id,
                    Type      = MilestoneTypes.Streak,
                    // La fecha del día en que se completa: así se vuelve a
                    // pagar en el siguiente bloque, pero no dos veces hoy.
                    PeriodKey = hoy.ToString("yyyy-MM-dd"),
                    Points    = options.StreakPoints,
                    Detail    = racha,
                };

                if (await _milestones.TryAwardAsync(award, ct))
                {
                    await CreditAsync(profile, options, award.Points,
                        SourceEvents.Streak,
                        $"Racha de {racha} días seguidos", ct);
                    pagados.Add(new AwardedMilestone(award.Type, award.Points, racha));
                }
            }
        }

        // ── Meta semanal ──────────────────────────────────────────────────
        var meta = options.WeeklyGoalFor(profile.UserType);
        if (meta > 0 && options.WeeklyGoalPoints > 0)
        {
            var lunes    = MilestoneRules.WeekStart(hoy);
            var desdeUtc = lunes.AddHours(-tz);
            var hastaUtc = lunes.AddDays(7).AddHours(-tz);

            var viajes = await _milestones.CountTripsAsync(profile.Id, desdeUtc, hastaUtc, ct);

            if (viajes >= meta)
            {
                var award = new MilestoneAward
                {
                    ProfileId = profile.Id,
                    Type      = MilestoneTypes.WeeklyGoal,
                    PeriodKey = MilestoneRules.WeekKey(hoy),
                    Points    = options.WeeklyGoalPoints,
                    Detail    = viajes,
                };

                if (await _milestones.TryAwardAsync(award, ct))
                {
                    await CreditAsync(profile, options, award.Points,
                        SourceEvents.WeeklyGoal,
                        $"Meta semanal: {viajes} viajes", ct);
                    pagados.Add(new AwardedMilestone(award.Type, award.Points, viajes));
                }
            }
        }

        return pagados;
    }

    /// <summary>Acredita el bono y recalcula el nivel.</summary>
    private async Task CreditAsync(
        PointsProfile profile, RewardsOptions options, int points,
        string sourceEvent, string nota, CancellationToken ct)
    {
        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(profile.UserType));

        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        points,
            sourceEvent:   sourceEvent,
            referenceId:   null,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        await _profiles.ApplyEarnAsync(profile, movement, ct);
    }
}
