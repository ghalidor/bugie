using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Queries;

/// <param name="IncludeDocument">Solo si quien consulta es admin: incluye tipo y número de documento.</param>
public record GetUsersBulkQuery(IEnumerable<Guid> Ids, bool IncludeDocument = false) : IRequest<List<UserProfileDto>>;
