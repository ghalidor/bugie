using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// El usuario usa un cupón de ticket de sorteo (canjeado en el catálogo) en un
/// sorteo abierto. Crea los tickets (origen points_redemption, tantos como
/// diga el cupón; 1 si no dice) y marca el cupón como usado, todo junto.
///
/// RedemptionId null = se usa el cupón de ticket que vence primero.
/// </summary>
public record UseRaffleTicketCouponCommand(
    Guid  UserId,
    string UserType,
    Guid  RaffleId,
    Guid? RedemptionId) : IRequest<UseTicketCouponResultDto>;

public class UseRaffleTicketCouponHandler
    : IRequestHandler<UseRaffleTicketCouponCommand, UseTicketCouponResultDto>
{
    private readonly IRaffleRepository         _raffles;
    private readonly IRedemptionRepository     _redemptions;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public UseRaffleTicketCouponHandler(
        IRaffleRepository raffles, IRedemptionRepository redemptions,
        IPointsProfileRepository profiles, IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _raffles     = raffles;
        _redemptions = redemptions;
        _profiles    = profiles;
        _levels      = levels;
        _settings    = settings;
    }

    public async Task<UseTicketCouponResultDto> Handle(
        UseRaffleTicketCouponCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        if (!options.RafflesEnabled)
            throw new InvalidOperationException("Los sorteos están desactivados por el momento.");

        // ── Cupón ──
        Redemption? cupon;
        if (cmd.RedemptionId is { } id)
        {
            cupon = await _redemptions.GetByIdAsync(id, ct);
            if (cupon is null || cupon.UserId != cmd.UserId)
                throw new KeyNotFoundException("Cupón no encontrado.");
        }
        else
        {
            cupon = (await _redemptions.GetActiveByTypeAsync(cmd.UserId, RewardTypes.RaffleTicket, ct))
                .FirstOrDefault()
                ?? throw new InvalidOperationException("No tienes cupones de ticket de sorteo disponibles.");
        }

        if (cupon.RewardType != RewardTypes.RaffleTicket)
            throw new InvalidOperationException("Ese cupón no es un ticket de sorteo.");
        if (cupon.Status != RedemptionStatus.Active)
            throw new InvalidOperationException(cupon.Status == RedemptionStatus.Used
                ? "Ese cupón ya se usó."
                : "Ese cupón ya no está vigente.");
        if (cupon.IsExpired)
            throw new InvalidOperationException("Ese cupón ya venció.");

        // ── Sorteo ──
        var raffle = await _raffles.GetByIdAsync(cmd.RaffleId, ct)
            ?? throw new KeyNotFoundException("Sorteo no encontrado.");
        if (!raffle.IsOpen || raffle.DrawDate <= DateTime.UtcNow)
            throw new InvalidOperationException("Este sorteo ya no acepta tickets.");

        // ── Requisitos: los mismos del reparto (tipo de cuenta, nivel, antigüedad) ──
        var profile = await _profiles.GetByUserIdAsync(cmd.UserId, ct);
        var userType = profile?.UserType ?? cmd.UserType;
        var niveles = await _levels.GetByUserTypeAsync(userType, ct);
        var miNivel = niveles.FirstOrDefault(l => l.Name == (profile?.CurrentLevel ?? "bronze"));

        var (puede, motivo) = GetUserRafflesHandler.Eligibility(raffle, userType, profile, miNivel, niveles);
        if (!puede || profile is null)
            throw new InvalidOperationException(motivo ?? "No cumples los requisitos de este sorteo.");

        // ── Usar: cupón + tickets en una transacción ──
        var cantidad = Math.Max(1, cupon.Quantity ?? 1);
        var numeros = await _raffles.UseTicketCouponAsync(
            raffle.Id, cmd.UserId, profile.Id, cupon.Id, cantidad,
            $"Usado en el sorteo {raffle.Name}", ct);

        if (numeros.Count == 0)
            throw new InvalidOperationException(
                "No se pudo usar el cupón: el sorteo ya no acepta tickets o el cupón ya se usó.");

        var usado   = await _redemptions.GetByIdAsync(cupon.Id, ct) ?? cupon;
        var misTix  = await _raffles.CountUserTicketsAsync(raffle.Id, cmd.UserId, null, ct);
        var quedan  = (await _redemptions.GetActiveByTypeAsync(cmd.UserId, RewardTypes.RaffleTicket, ct)).Count;

        return new UseTicketCouponResultDto(
            raffle.Id, raffle.Name, numeros.Count, numeros, misTix, quedan,
            GetMyRedemptionsHandler.ToDto(usado));
    }
}
