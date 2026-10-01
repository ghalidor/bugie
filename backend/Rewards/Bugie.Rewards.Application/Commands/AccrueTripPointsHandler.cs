using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

public class AccrueTripPointsHandler
    : IRequestHandler<AccrueTripPointsCommand, AccrueTripPointsResultDto>
{
    private readonly IPointsProfileRepository     _profiles;
    private readonly IPointsTransactionRepository _transactions;
    private readonly IRewardLevelRepository       _levels;
    private readonly IRewardSettingsRepository    _settings;
    private readonly IPromotionRepository         _promotions;
    private readonly IMediator                    _mediator;

    public AccrueTripPointsHandler(
        IPointsProfileRepository profiles,
        IPointsTransactionRepository transactions,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IPromotionRepository promotions,
        IMediator mediator)
    {
        _profiles     = profiles;
        _transactions = transactions;
        _levels       = levels;
        _settings     = settings;
        _promotions   = promotions;
        _mediator     = mediator;
    }

    public async Task<AccrueTripPointsResultDto> Handle(
        AccrueTripPointsCommand cmd, CancellationToken ct)
    {
        if (cmd.TripId == Guid.Empty)
            throw new ArgumentException("TripId requerido.");

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (!options.Enabled)
            return new AccrueTripPointsResultDto(cmd.TripId, 0, 0, true, "Motor de puntos desactivado.");

        if (cmd.Amount <= 0)
            return new AccrueTripPointsResultDto(cmd.TripId, 0, 0, true, "El viaje no tiene monto.");

        // Hora local del viaje. Los días y las franjas se evalúan en hora de
        // Perú, no en UTC: "12 del mediodía" tiene que ser el mediodía real.
        var completedUtc = cmd.CompletedAt ?? DateTime.UtcNow;
        var localTime    = completedUtc.AddHours(options.TimezoneOffsetHours);

        var promosUsadas = new List<string>();

        var passengerPoints = await AccrueAsync(
            cmd.PassengerId, UserTypes.Passenger, cmd, options,
            localTime, promosUsadas, ct);

        var driverPoints = 0;
        if (cmd.DriverId.HasValue && cmd.DriverId.Value != Guid.Empty)
            driverPoints = await AccrueAsync(
                cmd.DriverId.Value, UserTypes.Driver, cmd, options,
                localTime, promosUsadas, ct);

        // Si el pasajero o el conductor fueron referidos por alguien, este
        // viaje cuenta para su meta. Va aparte de los puntos del viaje: que
        // falle el conteo no puede impedir que se acrediten los puntos.
        await CountForReferralAsync(cmd.PassengerId, ct);
        if (cmd.DriverId.HasValue) await CountForReferralAsync(cmd.DriverId.Value, ct);

        return new AccrueTripPointsResultDto(
            cmd.TripId, passengerPoints, driverPoints, false, null,
            promosUsadas.Distinct().ToList());
    }

    private async Task CountForReferralAsync(Guid userId, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new CountReferralTripCommand(userId), ct);
        }
        catch
        {
            // El viaje ya acreditó sus puntos. Un fallo acá no debe revertirlo.
        }
    }

    private async Task<int> AccrueAsync(
        Guid userId, string userType, AccrueTripPointsCommand cmd,
        RewardsOptions options, DateTime localTime,
        List<string> promosUsadas, CancellationToken ct)
    {
        var rate = options.RateFor(userType);
        if (rate <= 0) return 0;

        // 1. Perfil: se crea la primera vez que el usuario gana puntos.
        var profile = await _profiles.GetByUserIdAsync(userId, ct);
        if (profile is null)
        {
            profile = PointsProfile.Create(userId, userType);
            await _profiles.AddAsync(profile, ct);
        }

        // 2. Promociones.
        var promo = PromotionResult.None;
        if (options.PromotionsEnabled)
        {
            var live = await _promotions.GetLiveAsync(userType, ct);
            if (live.Count > 0)
            {
                // La consulta de "primer viaje del día" solo se hace si alguna
                // promoción la necesita: es un viaje más a la base de datos.
                var needsFirstTrip = live.Any(p => p.Conditions.FirstTripOfDay == true);
                var isFirstTrip    = needsFirstTrip
                    && !await HasEarlierTripTodayAsync(profile.Id, localTime, options, cmd.TripId, ct);

                promo = PromotionEngine.Evaluate(
                    live, userType, DateTime.UtcNow,
                    new TripContext(cmd.Amount, cmd.PaymentMethod, localTime, isFirstTrip));
            }
        }

        var points = PromotionEngine.ApplyTo(cmd.Amount, rate, promo);
        if (points <= 0) return 0;

        // 3. Acreditar y renovar la vigencia de todo el saldo.
        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(userType));

        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var nota = promo.Applied.Count == 0
            ? null
            : "Promociones: " + string.Join(", ", promo.Applied.Select(a => a.Promotion.Name));

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        points,
            sourceEvent:   SourceEvents.TripCompleted,
            referenceId:   cmd.TripId,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        var applied = await _profiles.ApplyEarnAsync(profile, movement, ct);

        // false significa que el viaje ya se había acreditado antes.
        if (!applied) return 0;

        // 4. Dejar constancia de cada promoción, para poder medir su costo.
        if (promo.Applied.Count > 0)
        {
            var basePoints = (int)Math.Floor(cmd.Amount * rate);
            var extra      = Math.Max(0, points - basePoints);

            // El extra se reparte según lo que aportó cada promoción, para que
            // el reporte no se lo atribuya todo a una sola.
            var pesos = promo.Applied
                .Select(a => a.ExtraMultiplier * basePoints + a.BonusPoints)
                .ToList();
            var totalPeso = pesos.Sum();

            var repartos = promo.Applied.Select((a, i) => (
                PromotionId: a.Promotion.Id,
                PointsAdded: totalPeso <= 0 ? 0 : (int)Math.Round(extra * (pesos[i] / totalPeso))
            ));

            await _promotions.LogApplicationsAsync(profile.Id, cmd.TripId, repartos, ct);
            promosUsadas.AddRange(promo.Applied.Select(a => a.Promotion.Name));
        }

        return points;
    }

    /// <summary>
    /// ¿Ya ganó puntos por otro viaje en el mismo día local?
    /// El día se calcula en hora de Perú y se convierte de vuelta a UTC para
    /// consultar, porque las fechas de la base están en UTC.
    /// </summary>
    private Task<bool> HasEarlierTripTodayAsync(
        Guid profileId, DateTime localTime, RewardsOptions options,
        Guid currentTripId, CancellationToken ct)
    {
        var localDayStart = localTime.Date;
        var startUtc = localDayStart.AddHours(-options.TimezoneOffsetHours);
        var endUtc   = startUtc.AddDays(1);

        return _transactions.HasEarnedOnDayAsync(profileId, startUtc, endUtc, currentTripId, ct);
    }
}
