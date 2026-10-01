using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Catalogo de niveles. userType null = todos.</summary>
public record GetLevelsQuery(string? UserType) : IRequest<List<RewardLevelDto>>;
