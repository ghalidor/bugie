using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class CancelRedemptionHandler : IRequestHandler<CancelRedemptionCommand, RedemptionDto>
{
    private readonly IRedemptionRepository    _redemptions;
    private readonly IPointsProfileRepository _profiles;

    public CancelRedemptionHandler(
        IRedemptionRepository redemptions, IPointsProfileRepository profiles)
    {
        _redemptions = redemptions;
        _profiles    = profiles;
    }

    public async Task<RedemptionDto> Handle(CancelRedemptionCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? string.Empty).Trim().ToUpperInvariant();

        var redemption = await _redemptions.GetByCodeAsync(code, ct)
            ?? throw new KeyNotFoundException("Cupon no encontrado.");

        if (redemption.Status == RedemptionStatus.Cancelled)
            throw new InvalidOperationException("El cupon ya estaba anulado.");

        var profile = await _profiles.GetByUserIdAsync(redemption.UserId, ct)
            ?? throw new KeyNotFoundException("Perfil de puntos no encontrado.");

        // Lanza si el cupon ya se uso.
        redemption.Cancel(cmd.Note);

        var balanceBefore = profile.AvailablePoints;
        profile.RefundRedemption(redemption.PointsSpent);

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
