using MediatR;

namespace Bugie.Landing.Application.Commands;

public record UpdateSettingCommand(string Key, string Value, Guid UpdatedBy) : IRequest<bool>;
