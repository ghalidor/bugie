using MediatR;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Queries;

public class GetUsersHandler : IRequestHandler<GetUsersQuery, List<UserProfileDto>>
{
    private readonly IUserRepository _users;
    public GetUsersHandler(IUserRepository users) => _users = users;

    public async Task<List<UserProfileDto>> Handle(GetUsersQuery q, CancellationToken ct)
    {
        var users = await _users.GetAllAsync(q.Role, ct);
        return users.Select(u => new UserProfileDto(
            u.Id, u.FullName, u.Email, u.Phone, u.Role, u.IsActive,
            u.IsVerified, u.ProfilePhotoUrl, u.CreatedAt, u.AdminRoleId)).ToList();
    }
}
