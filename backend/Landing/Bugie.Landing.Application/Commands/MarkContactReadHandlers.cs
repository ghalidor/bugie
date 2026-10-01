using MediatR;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public class MarkContactAsReadHandler : IRequestHandler<MarkContactAsReadCommand, Unit>
{
    private readonly IContactRepository _repo;
    public MarkContactAsReadHandler(IContactRepository repo) => _repo = repo;

    public async Task<Unit> Handle(MarkContactAsReadCommand cmd, CancellationToken ct)
    {
        var msg = await _repo.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Mensaje no encontrado.");
        await _repo.MarkAsReadAsync(msg.Id, cmd.AdminUserId, ct);
        return Unit.Value;
    }
}

public class MarkContactAsUnreadHandler : IRequestHandler<MarkContactAsUnreadCommand, Unit>
{
    private readonly IContactRepository _repo;
    public MarkContactAsUnreadHandler(IContactRepository repo) => _repo = repo;

    public async Task<Unit> Handle(MarkContactAsUnreadCommand cmd, CancellationToken ct)
    {
        var msg = await _repo.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Mensaje no encontrado.");
        await _repo.MarkAsUnreadAsync(msg.Id, ct);
        return Unit.Value;
    }
}
