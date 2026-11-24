using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;
using Bugie.Rewards.Domain.Common;

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
    private readonly IMediator                 _mediator;

    public EvaluateMilestonesHandler(
        IMilestoneRepository milestones,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IMediator mediator)
    {
        _milestones = milestones;
        _profiles   = profiles;
        _levels     = levels;
        _settings   = settings;
        _mediator   = mediator;
    }

    public async Task<List<AwardedMilestone>> Handle(
        EvaluateMilestonesCommand cmd, CancellationToken ct)
    {
        var pagados = new List<AwardedMilestone>();

        var profile = await _profiles.GetByUserIdAsync(cmd.UserId, ct);
        if (profile is null) return pagados;

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var hoy     = cmd.TripLocalTime.Date;

        // ── Racha de días seguidos ────────────────────────────────────────
        if (options.StreakDays > 0 && options.StreakPoints > 0)
        {
            // Días con viaje (hora de Perú, según la hora real de cada viaje)
            // hasta el día de este viaje, del más reciente hacia atrás. La
            // racha se mide hasta el primer día sin viaje, así que se paga en
            // cada bloque (7, 14, …, 35, 42…), no solo en los primeros.
            var dias  = await _milestones.GetTripDaysAsync(cmd.UserId, hoy, MilestoneRules.MaxStreakDays, ct);
            var racha = MilestoneRules.CurrentStreak(dias, hoy);

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

                if (await CreditAsync(profile, options, award,
                        SourceEvents.Streak, $"Racha de {racha} días seguidos", ct))
                    pagados.Add(new AwardedMilestone(award.Type, award.Points, racha));
            }
        }

        // ── Meta semanal ──────────────────────────────────────────────────
        var meta = options.WeeklyGoalFor(profile.UserType);
        if (meta > 0 && options.WeeklyGoalPoints > 0)
        {
            var lunes    = MilestoneRules.WeekStart(hoy);
            var desdeUtc = BugieTime.PeruToUtc(lunes);
            var hastaUtc = BugieTime.PeruToUtc(lunes.AddDays(7));

            var viajes = await _milestones.CountUserTripsAsync(cmd.UserId, desdeUtc, hastaUtc, ct);

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

                if (await CreditAsync(profile, options, award,
                        SourceEvents.WeeklyGoal, $"Meta semanal: {viajes} viajes", ct))
                    pagados.Add(new AwardedMilestone(award.Type, award.Points, viajes));
            }
        }

        return pagados;
    }

    /// <summary>
    /// Registra el logro y acredita el bono en UNA transacción (si el abono
    /// falla, el logro no queda marcado). Devuelve false si ese periodo ya
    /// estaba pagado.
    /// </summary>
    private async Task<bool> CreditAsync(
        PointsProfile profile, RewardsOptions options, MilestoneAward award,
        string sourceEvent, string nota, CancellationToken ct)
    {
        var balanceBefore = profile.AvailablePoints;
        profile.Earn(award.Points, options.ExpiryMonthsFor(profile.UserType));

        var nivelAntes = profile.CurrentLevel;
        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        award.Points,
            sourceEvent:   sourceEvent,
            referenceId:   null,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        if (!await _profiles.ApplyMilestoneAsync(profile, movement, award, ct))
        {
            // Ya estaba pagado: el perfil en memoria no debe quedar con el
            // abono sumado (se usa para el siguiente logro de esta pasada).
            var real = await _profiles.GetByUserIdAsync(profile.UserId, ct);
            if (real is not null)
                profile.SyncBalances(real.TotalPoints, real.AvailablePoints, real.RedeemedPoints, real.CurrentLevel);
            return false;
        }

        await LevelUpNotice.SendIfChangedAsync(_mediator, profile, nivelAntes, ct);
        return true;
    }
}
