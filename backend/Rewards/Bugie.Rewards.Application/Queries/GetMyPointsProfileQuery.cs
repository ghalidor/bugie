using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Perfil de puntos del usuario logueado (saldo, nivel y progreso).</summary>
public record GetMyPointsProfileQuery(Guid UserId, string UserType)
    : IRequest<PointsProfileDto>;
