using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>El usuario canjea un item del catalogo por sus puntos.</summary>
public record RedeemRewardCommand(Guid UserId, string UserType, Guid CatalogItemId)
    : IRequest<RedeemResultDto>;
