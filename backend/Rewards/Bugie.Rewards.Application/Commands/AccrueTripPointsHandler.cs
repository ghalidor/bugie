using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;
using Bugie.Rewards.Domain.Common;

namespace Bugie.Rewards.Application.Commands;

public class AccrueTripPointsHandler
    : IRequestHandler<AccrueTripPointsCommand, AccrueTripPointsResultDto>
{
    private readonly IPointsProfileRepository     _profiles;
    private readonly IMilestoneRepository         _milestones;
    private readonly IRewardLevelRepository       _levels;
    private readonly IRewardSettingsRepository    _settings;
    private readonly IPromotionRepository         _promotions;
    private readonly IMediator                    _mediator;

    public AccrueTripPointsHandler(
        IPointsProfileRepository profiles,
        IMilestoneRepository milestones,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IPromotionRepository promotions,
        IMediator mediator)
    {
        _profiles     = profiles;
        _milestones   = milestones;
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

        // Hora real del viaje. Los días y las franjas se evalúan en hora de
        // Perú, no en UTC: "12 del mediodía" tiene que ser el mediodía real.
        var completedUtc = cmd.CompletedAt ?? DateTime.UtcNow;
        var localTime    = BugieTime.ToPeru(completedUtc);
        var hasDriver    = cmd.DriverId.HasValue && cmd.DriverId.Value != Guid.Empty;

        // 0. El viaje cuenta para racha, meta semanal, primer viaje del día y
        //    referidos aunque no dé puntos (p. ej. pagado 100% con cupón).
        //    Cada (usuario, viaje) se guarda una sola vez: un reintento del
        //    outbox no lo cuenta de nuevo.
        await _milestones.RecordTripAsync(cmd.PassengerId, cmd.TripId, UserTypes.Passenger, completedUtc, ct);
        if (hasDriver)
            await _milestones.RecordTripAsync(cmd.DriverId!.Value, cmd.TripId, UserTypes.Driver, completedUtc, ct);

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (!options.Enabled)
            return new AccrueTripPointsResultDto(cmd.TripId, 0, 0, true, "Motor de puntos desactivado.");

        // El pasajero gana sobre lo que pagó. El conductor, sobre la tarifa
        // acordada antes del cupón: el descuento lo asume Bugie, no él.
        var montoPasajero  = Math.Max(0m, cmd.Amount);
        var montoConductor = Math.Max(montoPasajero, cmd.BaseAmount ?? montoPasajero);

        var promosUsadas = new List<string>();

        var passengerPoints = await AccrueAsync(
            cmd.PassengerId, UserTypes.Passenger, montoPasajero, cmd, options,
            completedUtc, localTime, promosUsadas, ct);

        var driverPoints = 0;
        if (hasDriver)
            driverPoints = await AccrueAsync(
                cmd.DriverId!.Value, UserTypes.Driver, montoConductor, cmd, options,
                completedUtc, localTime, promosUsadas, ct);

        // Logros (racha, meta semanal) y referidos. Van después de los puntos
        // del viaje: si fallan, esos puntos ya quedaron acreditados y no se
        // revierten. Todos son idempotentes (índices únicos y recuento desde
        // TripActivity), así que un error no se traga: se lanza al final para
        // que quede en el log y el outbox de Trips reintente el evento.
        var errores = new List<Exception>();

        await TryAsync(errores, () => _mediator.Send(new EvaluateMilestonesCommand(cmd.PassengerId, localTime), ct));
        if (hasDriver)
            await TryAsync(errores, () => _mediator.Send(new EvaluateMilestonesCommand(cmd.DriverId!.Value, localTime), ct));

        await TryAsync(errores, () => _mediator.Send(new CountReferralTripCommand(cmd.PassengerId), ct));
        if (hasDriver)
            await TryAsync(errores, () => _mediator.Send(new CountReferralTripCommand(cmd.DriverId!.Value), ct));

        if (errores.Count > 0)
            throw new AggregateException(
                $"Viaje {cmd.TripId}: puntos acreditados (pasajero +{passengerPoints}, " +
                $"conductor +{driverPoints}), pero fallaron logros o referidos. " +
                "El outbox reintentará el evento (todo es idempotente).", errores);

        return new AccrueTripPointsResultDto(
            cmd.TripId, passengerPoints, driverPoints, false, null,
            promosUsadas.Distinct().ToList());
    }

    private static async Task TryAsync(List<Exception> errores, Func<Task> paso)
    {
        try { await paso(); }
        catch (Exception ex) { errores.Add(ex); }
    }

    private async Task<int> AccrueAsync(
        Guid userId, string userType, decimal amount, AccrueTripPointsCommand cmd,
        RewardsOptions options, DateTime completedUtc, DateTime localTime,
        List<string> promosUsadas, CancellationToken ct)
    {
        // 1. Perfil: se crea la primera vez que el usuario viaja, aunque este
        //    viaje no le dé puntos (lo necesitan sus logros).
        var profile = await PointsProfileLookup.GetOrCreateAsync(_profiles, userId, userType, ct);

        // Un perfil creado antes de viajar (referido, ajuste, cupón) pudo
        // quedar con otro tipo. En su primer viaje se corrige con su rol real.
        if (profile.UserType != userType
            && !await _milestones.HasOtherTripInRangeAsync(
                    userId, DateTime.UnixEpoch, completedUtc.AddYears(1), cmd.TripId, ct)
            && profile.ChangeUserType(userType))
        {
            await _profiles.UpdateUserTypeAsync(profile, ct);
        }

        var rate = options.RateFor(userType);
        if (rate <= 0 || amount <= 0) return 0;

        // 2. Promociones vigentes A LA HORA DEL VIAJE.
        var promo = PromotionResult.None;
        if (options.PromotionsEnabled)
        {
            var live = await _promotions.GetLiveAtAsync(userType, completedUtc, ct);
            if (live.Count > 0)
            {
                // La consulta de "primer viaje del día" solo se hace si alguna
                // promoción la necesita: es un viaje más a la base de datos.
                var needsFirstTrip = live.Any(p => p.Conditions.FirstTripOfDay == true);
                var isFirstTrip    = needsFirstTrip
                    && !await HasEarlierTripTodayAsync(userId, localTime, cmd.TripId, ct);

                promo = PromotionEngine.Evaluate(
                    live, userType, completedUtc,
                    new TripContext(amount, cmd.PaymentMethod, localTime, isFirstTrip));
            }
        }

        // Mes de aniversario: es PERSONAL, no una promoción, así que no pasa
        // por el motor de promociones. Se suma al multiplicador como lo hacen
        // las promociones aditivas: un 3x aporta +2.
        if (options.AnniversaryMultiplier > 1
            && MilestoneRules.IsAnniversaryMonth(BugieTime.ToPeru(profile.CreatedAt), localTime))
        {
            promo = promo with
            {
                TotalMultiplier = promo.TotalMultiplier + (options.AnniversaryMultiplier - 1m),
            };
            promosUsadas.Add("Mes de aniversario");
        }

        var points = PromotionEngine.ApplyTo(amount, rate, promo);
        if (points <= 0) return 0;

        // 3. Acreditar y renovar la vigencia de todo el saldo.
        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(userType));

        var nivelAntes = profile.CurrentLevel;
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

        // Si subió de nivel, aviso de los cupones del nivel (solo pasajero).
        await LevelUpNotice.SendIfChangedAsync(_mediator, profile, nivelAntes, ct);

        // 4. Dejar constancia de cada promoción, para poder medir su costo.
        if (promo.Applied.Count > 0)
        {
            var basePoints = (int)Math.Floor(amount * rate);
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
    /// ¿Ya tiene otro viaje completado el mismo día local (según la hora real
    /// de los viajes)? El día se calcula en hora de Perú y se convierte de
    /// vuelta a UTC para consultar.
    /// </summary>
    private Task<bool> HasEarlierTripTodayAsync(
        Guid userId, DateTime localTime, Guid currentTripId, CancellationToken ct)
    {
        var startUtc = BugieTime.PeruToUtc(localTime.Date);
        var endUtc   = startUtc.AddDays(1);

        return _milestones.HasOtherTripInRangeAsync(userId, startUtc, endUtc, currentTripId, ct);
    }
}
