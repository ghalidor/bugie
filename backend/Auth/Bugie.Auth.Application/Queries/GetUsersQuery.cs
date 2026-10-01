using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Queries;

public record GetUsersQuery(string? Role = null) : IRequest<List<UserProfileDto>>;
