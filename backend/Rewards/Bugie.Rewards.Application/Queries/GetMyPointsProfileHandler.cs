using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Queries;

public class GetMyPointsProfileHandler
    : IRequestHandler<GetMyPointsProfileQuery, PointsProfileDto>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public GetMyPointsProfileHandler(
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _profiles = profiles;
        _levels   = levels;
        _settings = settings;
    }

    public async Task<PointsProfileDto> Handle(GetMyPointsProfileQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var levels  = await _levels.GetByUserTypeAsync(q.UserType, ct);
        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);

        // Si el usuario nunca gano puntos, devolvemos un perfil en cero.
        // No creamos el registro en una lectura.
        var total     = profile?.TotalPoints     ?? 0;
        var available = profile?.AvailablePoints ?? 0;
        var redeemed  = profile?.RedeemedPoints  ?? 0;
        var basis     = profile?.PointsForLevel(options.LevelBasis) ?? 0;

        var current = PointsRules.ResolveLevel(levels, basis);
        var next    = PointsRules.ResolveNextLevel(levels, basis);

        var toNext   = next is null ? 0 : Math.Max(0, next.MinPoints - basis);
        var progress = Progress(current, next, basis);

        return new PointsProfileDto(
            UserId:             q.UserId,
            UserType:           profile?.UserType ?? q.UserType,
            TotalPoints:        total,
            AvailablePoints:    available,
            RedeemedPoints:     redeemed,
            CurrentLevel:       current?.Name ?? "bronze",
            CurrentLevelName:   current?.DisplayName ?? "Bronce",
            DiscountPercentage: current?.DiscountPercentage ?? 0m,
            NextLevel:          next?.Name,
            NextLevelName:      next?.DisplayName,
            PointsToNextLevel:  toNext,
            ProgressPercentage: progress,
            PointsExpiryDate:   profile?.PointsExpiryDate,
            LastActivityDate:   profile?.LastActivityDate);
    }

    /// <summary>Porcentaje 0-100 de avance dentro del nivel actual.</summary>
    private static int Progress(RewardLevel? current, RewardLevel? next, int points)
    {
        if (next is null) return 100;          // ya esta en el nivel mas alto
        var floor = current?.MinPoints ?? 0;
        var span  = next.MinPoints - floor;
        if (span <= 0) return 0;
        var pct = (double)(points - floor) / span * 100d;
        return (int)Math.Clamp(Math.Round(pct), 0, 100);
    }
}
