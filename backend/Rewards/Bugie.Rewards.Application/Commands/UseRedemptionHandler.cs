using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class UseRedemptionHandler : IRequestHandler<UseRedemptionCommand, RedemptionDto>
{
    private readonly IRedemptionRepository _redemptions;
    public UseRedemptionHandler(IRedemptionRepository redemptions) => _redemptions = redemptions;

    public async Task<RedemptionDto> Handle(UseRedemptionCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? string.Empty).Trim().ToUpperInvariant();

        var redemption = await _redemptions.GetByCodeAsync(code, ct)
            ?? throw new KeyNotFoundException("Cupon no encontrado.");

        // Lanza si ya estaba usado, anulado o vencido.
        redemption.Use(cmd.ReferenceId, cmd.Note);

        await _redemptions.UpdateAsync(redemption, ct);
        return GetMyRedemptionsHandler.ToDto(redemption);
    }
}
