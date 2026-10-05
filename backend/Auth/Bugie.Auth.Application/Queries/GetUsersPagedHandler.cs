using MediatR;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Queries;

/// <summary>
/// Pide una página de usuarios con filtros opcionales.
/// - Page: 1-based.
/// - PageSize: cuántos por página (típico 25-50).
/// - Search: matchea contra FullName o Email.
/// - Role: 'driver' | 'passenger' | 'admin' | null (todos).
/// - Verified: true/false para filtrar por IsVerified, null = sin filtro.
/// - Deleted: false (defecto) = sin eliminadas; true = solo eliminadas; null = todas.
/// </summary>
public record GetUsersPagedQuery(
    int Page,
    int PageSize,
    string? Search,
    string? Role,
    bool? Verified = null,
    bool? Deleted = false) : IRequest<UsersPagedDto>;

/// <summary>Respuesta paginada para listas grandes (5000+ usuarios).</summary>
public record UsersPagedDto(
    List<UserProfileDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetUsersPagedHandler
    : IRequestHandler<GetUsersPagedQuery, UsersPagedDto>
{
    private readonly IUserRepository _users;
    public GetUsersPagedHandler(IUserRepository users) => _users = users;

    public async Task<UsersPagedDto> Handle(GetUsersPagedQuery q, CancellationToken ct)
    {
        var (items, total) = await _users.GetPagedAsync(
            q.Page, q.PageSize, q.Search, q.Role, q.Verified, ct, q.Deleted);

        // Sin firma (pesa y no se usa en las listas). Incluye documento y estado "Eliminada".
        var dtos = items.Select(u => UserProfileDto.From(u) with { SignatureImage = null }).ToList();

        return new UsersPagedDto(dtos, q.Page, q.PageSize, total);
    }
}
