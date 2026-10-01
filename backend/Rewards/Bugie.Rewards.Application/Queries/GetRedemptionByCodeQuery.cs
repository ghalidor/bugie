using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Busca un cupon por su codigo. Devuelve null si no existe.</summary>
public record GetRedemptionByCodeQuery(string Code) : IRequest<RedemptionDto?>;
