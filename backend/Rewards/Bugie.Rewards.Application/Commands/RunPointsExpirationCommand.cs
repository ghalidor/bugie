using MediatR;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Corre una pasada de vencimiento: primero avisa a quien esta por perder
/// puntos, despues vence a quien ya se le paso la fecha.
/// Lo dispara el proceso nocturno, no un usuario.
/// </summary>
public record RunPointsExpirationCommand(int BatchSize = 500)
    : IRequest<PointsExpirationResult>;

public record PointsExpirationResult(int Warned, int Expired, int PointsLost);
