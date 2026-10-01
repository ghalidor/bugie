using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Cupones del usuario. status null = todos.</summary>
public record GetMyRedemptionsQuery(Guid UserId, string? Status, int Page, int PageSize)
    : IRequest<PagedResult<RedemptionDto>>;
