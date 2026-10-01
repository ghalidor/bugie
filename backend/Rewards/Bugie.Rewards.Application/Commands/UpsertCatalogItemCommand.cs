using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Admin: crea o edita un item del catalogo.
/// Id null = crear. Id con valor = editar.
/// </summary>
public record UpsertCatalogItemCommand(
    Guid?    Id,
    string   Code,
    string   UserType,
    string   Name,
    string?  Description,
    int      PointsCost,
    string   RewardType,
    decimal? AmountSoles,
    int?     Quantity,
    decimal? Percentage,
    string?  MinLevel,
    int?     Stock,
    int      ValidityDays,
    short    SortOrder,
    bool     IsActive) : IRequest<CatalogItemDto>;
