using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class UpsertCatalogItemHandler : IRequestHandler<UpsertCatalogItemCommand, CatalogItemDto>
{
    private readonly ICatalogRepository     _catalog;
    private readonly IRewardLevelRepository _levels;

    public UpsertCatalogItemHandler(ICatalogRepository catalog, IRewardLevelRepository levels)
    {
        _catalog = catalog;
        _levels  = levels;
    }

    public async Task<CatalogItemDto> Handle(UpsertCatalogItemCommand cmd, CancellationToken ct)
    {
        Validate(cmd);

        var levels = await _levels.GetByUserTypeAsync(cmd.UserType, ct);

        if (cmd.MinLevel is not null && levels.All(l => l.Name != cmd.MinLevel))
            throw new ArgumentException($"El nivel '{cmd.MinLevel}' no existe para {cmd.UserType}.");

        CatalogItem item;
        var now = DateTime.UtcNow;

        if (cmd.Id is null)
        {
            var code = cmd.Code.Trim().ToLowerInvariant();
            if (await _catalog.GetByCodeAsync(code, ct) is not null)
                throw new ArgumentException($"Ya existe una recompensa con el codigo '{code}'.");

            item = new CatalogItem { Id = Guid.NewGuid(), Code = code, CreatedAt = now };
        }
        else
        {
            item = await _catalog.GetByIdAsync(cmd.Id.Value, ct)
                ?? throw new KeyNotFoundException("Recompensa no encontrada.");
        }

        item.UserType     = cmd.UserType;
        item.Name         = cmd.Name.Trim();
        item.Description  = cmd.Description?.Trim();
        item.PointsCost   = cmd.PointsCost;
        item.RewardType   = cmd.RewardType;
        item.AmountSoles  = cmd.AmountSoles;
        item.Quantity     = cmd.Quantity;
        item.Percentage   = cmd.Percentage;
        item.MinLevel     = cmd.MinLevel;
        item.Stock        = cmd.Stock;
        item.ValidityDays = cmd.ValidityDays;
        item.SortOrder    = cmd.SortOrder;
        item.IsActive     = cmd.IsActive;
        item.UpdatedAt    = now;

        if (cmd.Id is null) await _catalog.AddAsync(item, ct);
        else                await _catalog.UpdateAsync(item, ct);

        return GetCatalogHandler.ToDto(item, int.MaxValue, short.MaxValue, levels);
    }

    /// <summary>
    /// Cada tipo de recompensa necesita datos distintos. Si falta el dato, el
    /// item quedaria roto al momento de canjearlo, asi que se valida aca.
    /// </summary>
    private static void Validate(UpsertCatalogItemCommand cmd)
    {
        if (string.IsNullOrWhiteSpace(cmd.Code))
            throw new ArgumentException("El codigo es requerido.");
        if (string.IsNullOrWhiteSpace(cmd.Name))
            throw new ArgumentException("El nombre es requerido.");
        if (!UserTypes.IsValid(cmd.UserType))
            throw new ArgumentException("UserType debe ser 'passenger' o 'driver'.");
        if (!RewardTypes.IsValid(cmd.RewardType))
            throw new ArgumentException(
                $"RewardType invalido. Validos: {string.Join(", ", RewardTypes.All)}");
        if (cmd.PointsCost <= 0)
            throw new ArgumentException("El costo en puntos debe ser mayor a 0.");
        if (cmd.ValidityDays <= 0)
            throw new ArgumentException("La vigencia del cupon debe ser al menos 1 dia.");
        if (cmd.Stock is < 0)
            throw new ArgumentException("El stock no puede ser negativo.");

        switch (cmd.RewardType)
        {
            case RewardTypes.DiscountAmount:
            case RewardTypes.FreeTrip:
            case RewardTypes.WalletBonus:
                if (cmd.AmountSoles is null or <= 0)
                    throw new ArgumentException("Este tipo de recompensa necesita un monto en soles mayor a 0.");
                break;

            case RewardTypes.DiscountPeriod:
                if (cmd.Percentage is null or <= 0 or > 100)
                    throw new ArgumentException("El porcentaje de descuento debe estar entre 1 y 100.");
                if (cmd.Quantity is null or <= 0)
                    throw new ArgumentException("Indica cuantos dias dura el descuento.");
                break;

            case RewardTypes.RaffleTicket:
                if (cmd.Quantity is null or <= 0)
                    throw new ArgumentException("Indica cuantos tickets entrega la recompensa.");
                break;
        }
    }
}
