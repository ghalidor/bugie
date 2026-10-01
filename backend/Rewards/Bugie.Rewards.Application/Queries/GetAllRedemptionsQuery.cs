using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Admin: todos los canjes, para auditoria y entrega de premios.</summary>
public record GetAllRedemptionsQuery(string? Status, string? UserType, int Page, int PageSize)
    : IRequest<PagedResult<RedemptionDto>>;
