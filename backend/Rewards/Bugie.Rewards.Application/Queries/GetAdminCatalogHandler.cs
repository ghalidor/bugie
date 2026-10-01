using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetAdminCatalogHandler : IRequestHandler<GetAdminCatalogQuery, List<CatalogItemDto>>
{
    private readonly ICatalogRepository     _catalog;
    private readonly IRewardLevelRepository _levels;

    public GetAdminCatalogHandler(ICatalogRepository catalog, IRewardLevelRepository levels)
    {
        _catalog = catalog;
        _levels  = levels;
    }

    public async Task<List<CatalogItemDto>> Handle(GetAdminCatalogQuery q, CancellationToken ct)
    {
        var items = string.IsNullOrWhiteSpace(q.UserType)
            ? await _catalog.GetAllAsync(ct)
            : await _catalog.GetByUserTypeAsync(q.UserType, onlyActive: false, ct);

        var levels = await _levels.GetAllAsync(ct);

        // El admin ve todo: pasamos saldo y nivel maximos para que nada aparezca
        // bloqueado por falta de puntos.
        return items
            .Select(i => GetCatalogHandler.ToDto(i, int.MaxValue, short.MaxValue, levels))
            .ToList();
    }
}
