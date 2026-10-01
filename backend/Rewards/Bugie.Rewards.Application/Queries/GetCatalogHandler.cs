using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetCatalogHandler : IRequestHandler<GetCatalogQuery, List<CatalogItemDto>>
{
    private readonly ICatalogRepository       _catalog;
    private readonly IPointsProfileRepository _profiles;
    private readonly IRewardLevelRepository   _levels;

    public GetCatalogHandler(
        ICatalogRepository catalog,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels)
    {
        _catalog  = catalog;
        _profiles = profiles;
        _levels   = levels;
    }

    public async Task<List<CatalogItemDto>> Handle(GetCatalogQuery q, CancellationToken ct)
    {
        var items   = await _catalog.GetByUserTypeAsync(q.UserType, onlyActive: true, ct);
        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);
        var levels  = await _levels.GetByUserTypeAsync(q.UserType, ct);

        var available = profile?.AvailablePoints ?? 0;
        var userLevelOrder = (short)(levels
            .FirstOrDefault(l => l.Name == (profile?.CurrentLevel ?? "bronze"))?.SortOrder ?? 0);

        return items.Select(i => ToDto(i, available, userLevelOrder, levels)).ToList();
    }

    internal static CatalogItemDto ToDto(
        CatalogItem i, int availablePoints, short userLevelOrder, List<RewardLevel> levels)
    {
        var missing = Math.Max(0, i.PointsCost - availablePoints);

        string? blocked = null;
        if (!i.HasStock)
        {
            blocked = "Agotado por ahora.";
        }
        else if (i.MinLevel is not null)
        {
            var required = levels.FirstOrDefault(l => l.Name == i.MinLevel);
            if (required is not null && userLevelOrder < required.SortOrder)
                blocked = $"Necesitas nivel {required.DisplayName}.";
        }

        if (blocked is null && missing > 0)
            blocked = $"Te faltan {missing} puntos.";

        return new CatalogItemDto(
            i.Id, i.Code, i.UserType, i.Name, i.Description, i.PointsCost, i.RewardType,
            i.AmountSoles, i.Quantity, i.Percentage, i.MinLevel, i.Stock,
            i.ValidityDays, i.SortOrder, i.IsActive,
            CanAfford:     blocked is null,
            PointsMissing: missing,
            BlockedReason: blocked);
    }
}
