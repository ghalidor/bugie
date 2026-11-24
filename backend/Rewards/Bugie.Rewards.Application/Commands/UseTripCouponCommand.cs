using System.Globalization;
using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Trips completó un viaje que tenía cupón: se consume el cupón y, si era de
/// monto y valía más que lo que se descontó, el sobrante vuelve al pasajero
/// como puntos (regla del dueño).
///
/// <paramref name="AppliedDiscount"/> es lo que de verdad se descontó de la
/// tarifa (nunca más que el precio del viaje).
///
/// Idempotente: si el cupón ya estaba usado EN ESTE MISMO viaje no falla, y el
/// sobrante no se acredita dos veces (índice único perfil + origen + viaje).
///
/// Lo normal es que el cupón llegue 'reserved' para este viaje (se reservó al
/// aplicarlo): se consume aunque haya pasado su fecha mientras el viaje
/// seguía. Por compatibilidad también se acepta uno 'active' y vigente.
/// </summary>
public record UseTripCouponCommand(string Code, Guid TripId, decimal AppliedDiscount)
    : IRequest<TripCouponUsedDto>;

public class UseTripCouponHandler : IRequestHandler<UseTripCouponCommand, TripCouponUsedDto>
{
    private readonly IRedemptionRepository     _redemptions;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly IFcmSender                _push;
    private readonly IUserDirectory            _users;
    private readonly IMediator                 _mediator;

    public UseTripCouponHandler(
        IRedemptionRepository redemptions,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IFcmSender push,
        IUserDirectory users,
        IMediator mediator)
    {
        _redemptions = redemptions;
        _profiles    = profiles;
        _levels      = levels;
        _settings    = settings;
        _push        = push;
        _users       = users;
        _mediator    = mediator;
    }

    public async Task<TripCouponUsedDto> Handle(UseTripCouponCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? string.Empty).Trim().ToUpperInvariant();

        var cupon = await _redemptions.GetByCodeAsync(code, ct)
            ?? throw new KeyNotFoundException("Cupon no encontrado.");

        // Reintento del mismo viaje: el cupón ya quedó usado, solo falta
        // (quizá) el sobrante. Usado en OTRO viaje sí es un error.
        var yaUsado = cupon.Status == RedemptionStatus.Used && cupon.UsedReferenceId == cmd.TripId;
        if (!yaUsado)
        {
            if (cupon.Status == RedemptionStatus.Reserved && !cupon.IsReservedFor(cmd.TripId))
                throw new InvalidOperationException("El cupón está reservado en otro viaje.");

            // UPDATE condicionado: si llegan dos avisos a la vez, solo uno lo consume.
            if (!await _redemptions.TryConsumeForTripAsync(cupon.Id, cmd.TripId, "Aplicado al viaje", ct))
            {
                var ahora = await _redemptions.GetByCodeAsync(code, ct);
                if (ahora is null || ahora.Status != RedemptionStatus.Used || ahora.UsedReferenceId != cmd.TripId)
                    throw new InvalidOperationException(
                        $"El cupón no se pudo consumir: está en estado '{ahora?.Status ?? "desconocido"}'.");
                yaUsado = true;   // el otro aviso se adelantó
            }
        }

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var soles   = CouponLeftoverRules.LeftoverSoles(cupon.RewardType, cupon.AmountSoles, cmd.AppliedDiscount);
        var puntos  = CouponLeftoverRules.ToPoints(soles, options.RateFor(UserTypes.Passenger));

        if (puntos <= 0)
            return new TripCouponUsedDto(cupon.Code, yaUsado, 0, 0);

        var acreditados = await CreditLeftoverAsync(cupon, cmd.TripId, soles, puntos, options, ct);
        return new TripCouponUsedDto(cupon.Code, yaUsado, soles, acreditados);
    }

    /// <summary>Acredita el sobrante. Devuelve 0 si ya se había acreditado por este viaje.</summary>
    private async Task<int> CreditLeftoverAsync(
        Redemption cupon, Guid tripId, decimal soles, int puntos,
        RewardsOptions options, CancellationToken ct)
    {
        // Si todavía no tiene perfil, se crea con el tipo de su cuenta (rol).
        var profile = await PointsProfileLookup.GetOrCreateAsync(_profiles, _users, cupon.UserId, ct);

        var balanceBefore = profile.AvailablePoints;
        // Completar el viaje es actividad: igual que los puntos del viaje,
        // renueva la vigencia del saldo.
        profile.Earn(puntos, options.ExpiryMonthsFor(profile.UserType));

        var nivelAntes = profile.CurrentLevel;
        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        // Tipo 'bonus' (devolución), con el viaje como referencia.
        var movement = PointsTransaction.Refund(
            profileId:     profile.Id,
            points:        puntos,
            sourceEvent:   SourceEvents.CouponLeftover,
            referenceId:   tripId,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         $"Saldo del cupón {cupon.Code} (S/ {soles.ToString("0.00", CultureInfo.InvariantCulture)})");

        if (!await _profiles.ApplyEarnAsync(profile, movement, ct)) return 0;

        await LevelUpNotice.SendIfChangedAsync(_mediator, profile, nivelAntes, ct);

        // Push + bandeja (FcmSender pasa por Trips). Nunca lanza.
        await _push.SendToUserAsync(cupon.UserId, new FcmPushMessage(
            Title: "Puntos devueltos",
            Body:  $"Te devolvimos {puntos} puntos: tu cupón valía más que el viaje.",
            Route: "/rewards",
            ExtraData: new Dictionary<string, string>
            {
                ["type"]   = "coupon_leftover",
                ["points"] = puntos.ToString(CultureInfo.InvariantCulture),
                ["code"]   = cupon.Code,
                ["tripId"] = tripId.ToString(),
            }), ct);

        return puntos;
    }
}
