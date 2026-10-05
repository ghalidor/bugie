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
        // El documento es dato sensible: solo va si consulta un admin.
        return users.Select(u => q.IncludeDocument
            ? UserProfileDto.From(u)
            : UserProfileDto.From(u) with { DocType = null, DocNumber = null }).ToList();
    }
}
