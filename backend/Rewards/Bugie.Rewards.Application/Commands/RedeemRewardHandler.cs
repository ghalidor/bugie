using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

public class RedeemRewardHandler : IRequestHandler<RedeemRewardCommand, RedeemResultDto>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly ICatalogRepository        _catalog;
    private readonly IRedemptionRepository     _redemptions;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public RedeemRewardHandler(
        IPointsProfileRepository profiles,
        ICatalogRepository catalog,
        IRedemptionRepository redemptions,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _profiles    = profiles;
        _catalog     = catalog;
        _redemptions = redemptions;
        _levels      = levels;
        _settings    = settings;
    }

    public async Task<RedeemResultDto> Handle(RedeemRewardCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        if (!options.RedemptionEnabled)
            throw new InvalidOperationException("El canje de puntos esta temporalmente deshabilitado.");

        // ---- 1. Validaciones de negocio -------------------------------------
        var item = await _catalog.GetByIdAsync(cmd.CatalogItemId, ct)
            ?? throw new KeyNotFoundException("La recompensa no existe.");

        if (!item.IsActive)
            throw new InvalidOperationException("Esta recompensa no esta disponible.");

        if (item.UserType != cmd.UserType)
            throw new InvalidOperationException("Esta recompensa no corresponde a tu tipo de cuenta.");

        if (!item.HasStock)
            throw new InvalidOperationException("Esta recompensa se agoto.");

        var profile = await _profiles.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new InvalidOperationException("Todavia no tienes puntos acumulados.");

        if (profile.AvailablePoints < item.PointsCost)
            throw new InvalidOperationException(
                $"Te faltan {item.PointsCost - profile.AvailablePoints} puntos para esta recompensa.");

        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);

        if (item.MinLevel is not null)
        {
            var required = levels.FirstOrDefault(l => l.Name == item.MinLevel);
            var current  = levels.FirstOrDefault(l => l.Name == profile.CurrentLevel);
            if (required is not null && (current?.SortOrder ?? 0) < required.SortOrder)
                throw new InvalidOperationException(
                    $"Necesitas nivel {required.DisplayName} para canjear esta recompensa.");
        }

        // ---- 2. Armar el canje ----------------------------------------------
        var balanceBefore = profile.AvailablePoints;
        profile.Redeem(item.PointsCost);

        // Si el nivel se calcula por saldo disponible, canjear puede bajarlo.
        // Si se calcula por historico (default), esto no cambia nada.
        var level = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var redemption = Redemption.Create(profile, item);

        var movement = PointsTransaction.Redeem(
            profileId:     profile.Id,
            points:        item.PointsCost,
            sourceEvent:   RedemptionSourceEvents.CatalogRedemption,
            referenceId:   redemption.Id,
            balanceBefore: balanceBefore,
            notes:         item.Name);

        // ---- 3. Guardar todo junto -------------------------------------------
        // El repositorio descuenta los puntos con un WHERE sobre el saldo
        // esperado. Si el usuario dio doble clic, la segunda pasada devuelve
        // false y no se cobra dos veces.
        var applied = await _redemptions.ApplyRedemptionAsync(
            profile, movement, redemption,
            decrementStock: item.Stock.HasValue, ct);

        if (!applied)
            throw new InvalidOperationException(
                "No se pudo completar el canje. Revisa tu saldo e intentalo de nuevo.");

        return new RedeemResultDto(
            GetMyRedemptionsHandler.ToDto(redemption),
            profile.AvailablePoints,
            profile.CurrentLevel);
    }
}
