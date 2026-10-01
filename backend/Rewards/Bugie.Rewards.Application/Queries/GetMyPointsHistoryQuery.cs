using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Historial de movimientos de puntos del usuario logueado.</summary>
public record GetMyPointsHistoryQuery(Guid UserId, int Page, int PageSize)
    : IRequest<PagedResult<PointsTransactionDto>>;
