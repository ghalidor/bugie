using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Admin: catalogo completo, incluidos los items desactivados.
/// userType null = todos.
/// </summary>
public record GetAdminCatalogQuery(string? UserType) : IRequest<List<CatalogItemDto>>;
