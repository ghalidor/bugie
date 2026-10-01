using MediatR;

namespace Bugie.Rewards.Application.Commands;

/// <summary>Admin: cambia una clave de configuracion del motor de puntos.</summary>
public record UpdateSettingCommand(string SettingKey, string Value, Guid? UpdatedBy)
    : IRequest<Unit>;
