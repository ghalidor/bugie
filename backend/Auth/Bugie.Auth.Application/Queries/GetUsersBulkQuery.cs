using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Queries;

public record GetUsersBulkQuery(IEnumerable<Guid> Ids) : IRequest<List<UserProfileDto>>;
