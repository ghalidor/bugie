using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class UseRedemptionHandler : IRequestHandler<UseRedemptionCommand, RedemptionDto>
{
    private readonly IRedemptionRepository _redemptions;
    private readonly IFcmSender            _push;

    public UseRedemptionHandler(IRedemptionRepository redemptions, IFcmSender push)
        => (_redemptions, _push) = (redemptions, push);

    public async Task<RedemptionDto> Handle(UseRedemptionCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? string.Empty).Trim().ToUpperInvariant();

        var redemption = await _redemptions.GetByCodeAsync(code, ct)
            ?? throw new KeyNotFoundException("Cupon no encontrado.");

        // Lanza si ya estaba usado, anulado o vencido.
        redemption.Use(cmd.ReferenceId, cmd.Note);

        await _redemptions.UpdateAsync(redemption, ct);

        // Entrega manual del admin: push + bandeja (FcmSender pasa por Trips).
        // Nunca lanza: el canje ya quedo marcado como entregado.
        if (cmd.NotifyUser)
            await _push.SendToUserAsync(redemption.UserId, new FcmPushMessage(
                Title: "Tu canje está listo",
                Body:  $"Bugie marcó como entregado: {redemption.ItemName} (código {redemption.Code}).",
                Route: "/rewards?tab=coupons",
                ExtraData: new Dictionary<string, string>
                {
                    ["type"]       = "reward_delivered",
                    ["alert_type"] = "accepted",
                    ["tab"]        = "coupons",
                    ["code"]       = redemption.Code,
                }), ct);

        return GetMyRedemptionsHandler.ToDto(redemption);
    }
}
