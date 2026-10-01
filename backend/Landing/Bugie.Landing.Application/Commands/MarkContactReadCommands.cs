using MediatR;

namespace Bugie.Landing.Application.Commands;

public record MarkContactAsReadCommand(Guid Id, Guid? AdminUserId) : IRequest<Unit>;
public record MarkContactAsUnreadCommand(Guid Id) : IRequest<Unit>;
