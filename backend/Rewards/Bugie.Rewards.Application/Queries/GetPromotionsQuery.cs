using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Admin: todas las promociones, con cuánto han costado.</summary>
public record GetPromotionsQuery : IRequest<List<PromotionDto>>;
