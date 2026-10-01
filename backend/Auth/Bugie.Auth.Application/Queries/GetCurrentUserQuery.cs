using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Queries;

public record GetCurrentUserQuery(Guid UserId) : IRequest<UserProfileDto>;
