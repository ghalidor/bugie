using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Catalogo para el usuario logueado, con el saldo ya comparado contra cada item.
/// </summary>
public record GetCatalogQuery(Guid UserId, string UserType) : IRequest<List<CatalogItemDto>>;
