using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class CancelRedemptionHandler : IRequestHandler<CancelRedemptionCommand, RedemptionDto>
{
    private readonly IRedemptionRepository     _redemptions;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardSettingsRepository _settings;

    public CancelRedemptionHandler(
        IRedemptionRepository redemptions, IPointsProfileRepository profiles,
        IRewardSettingsRepository settings)
    {
        _redemptions = redemptions;
        _profiles    = profiles;
        _settings    = settings;
    }

    public async Task<RedemptionDto> Handle(CancelRedemptionCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? string.Empty).Trim().ToUpperInvariant();

        var redemption = await _redemptions.GetByCodeAsync(code, ct)
            ?? throw new KeyNotFoundException("Cupon no encontrado.");

        if (redemption.Status == RedemptionStatus.Cancelled)
            throw new InvalidOperationException("El cupon ya estaba anulado.");

        // Cupon que no costo puntos (beneficio de nivel): solo se anula.
        // Su cupo del mes vuelve a quedar libre (no se cuentan los anulados).
        if (redemption.PointsSpent <= 0)
        {
            redemption.Cancel(cmd.Note ?? "Cupón anulado por el administrador.");
            if (!await _redemptions.CancelWithoutRefundAsync(redemption, ct))
                throw new InvalidOperationException("No se pudo anular el cupón.");
            return GetMyRedemptionsHandler.ToDto(redemption);
        }

        var profile = await _profiles.GetByUserIdAsync(redemption.UserId, ct)
            ?? throw new KeyNotFoundException("Perfil de puntos no encontrado.");

        // Lanza si el cupon ya se uso.
        redemption.Cancel(cmd.Note);

        // Si el perfil ya no tiene fecha de vencimiento (saldo vencido), los
        // puntos devueltos reciben la vigencia normal de su tipo de cuenta.
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        var balanceBefore = profile.AvailablePoints;
        profile.RefundRedemption(redemption.PointsSpent, options.ExpiryMonthsFor(profile.UserType));

        var movement = PointsTransaction.Refund(
            profileId:     profile.Id,
            points:        redemption.PointsSpent,
            sourceEvent:   RedemptionSourceEvents.RedemptionRefund,
            referenceId:   redemption.Id,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         cmd.Note ?? "Canje anulado por el administrador.");

        var ok = await _redemptions.ApplyRefundAsync(profile, movement, redemption, ct);
        if (!ok)
            throw new InvalidOperationException("No se pudo anular el canje.");

        return GetMyRedemptionsHandler.ToDto(redemption);
    }
}
