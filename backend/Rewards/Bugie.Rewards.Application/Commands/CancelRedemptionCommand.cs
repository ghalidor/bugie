using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Admin: anula un cupon sin usar y devuelve los puntos al usuario.
/// </summary>
public record CancelRedemptionCommand(string Code, string? Note) : IRequest<RedemptionDto>;
