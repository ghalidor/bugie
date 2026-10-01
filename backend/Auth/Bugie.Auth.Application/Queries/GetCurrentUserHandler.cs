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

        return new UserProfileDto(
            user.Id, user.FullName, user.Email,
            user.Phone, user.Role, user.IsActive, user.IsVerified,
            user.ProfilePhotoUrl, user.CreatedAt, user.AdminRoleId);
    }
}
