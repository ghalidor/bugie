using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Admin: cómo va el programa de referidos.</summary>
public record GetReferralStatsQuery : IRequest<ReferralStatsDto>;
