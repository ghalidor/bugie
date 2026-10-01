using MediatR;

namespace Bugie.Landing.Application.Commands;

public record SendContactCommand(
    string Name, string Email, string Subject, string Message) : IRequest<Guid>;
