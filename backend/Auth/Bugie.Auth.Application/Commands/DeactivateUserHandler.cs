using MediatR;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class DeactivateUserHandler : IRequestHandler<DeactivateUserCommand, bool>
{
    private readonly IUserRepository _users;
    public DeactivateUserHandler(IUserRepository users) => _users = users;

    public async Task<bool> Handle(DeactivateUserCommand cmd, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");
        user.Deactivate();
        await _users.UpdateAsync(user, ct);
        return true;
    }
}
