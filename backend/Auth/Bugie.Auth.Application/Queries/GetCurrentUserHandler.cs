using MediatR;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Queries;

public class GetCurrentUserHandler : IRequestHandler<GetCurrentUserQuery, UserProfileDto>
{
    private readonly IUserRepository _users;
    public GetCurrentUserHandler(IUserRepository users) => _users = users;

    public async Task<UserProfileDto> Handle(GetCurrentUserQuery q, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(q.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        return UserProfileDto.From(user);
    }
}
