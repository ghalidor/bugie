using MediatR;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Queries;

public class GetUsersBulkHandler : IRequestHandler<GetUsersBulkQuery, List<UserProfileDto>>
{
    private readonly IUserRepository _users;
    public GetUsersBulkHandler(IUserRepository users) => _users = users;

    public async Task<List<UserProfileDto>> Handle(GetUsersBulkQuery q, CancellationToken ct)
    {
        var users = await _users.GetByIdsAsync(q.Ids, ct);
        return users.Select(u => new UserProfileDto(
            u.Id, u.FullName, u.Email, u.Phone, u.Role, u.IsActive,
            u.IsVerified, u.ProfilePhotoUrl, u.CreatedAt, u.AdminRoleId,
            u.TermsAccepted, u.TermsAcceptedAt, u.SignatureImage)).ToList();
    }
}
