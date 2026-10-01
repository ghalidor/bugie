using MediatR;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Queries;

/// <summary>
/// Estadísticas agregadas de usuarios para los KPIs del panel admin.
/// Respeta los mismos filtros (search + role) que la lista paginada,
/// para que los KPIs reflejen lo que el admin está viendo.
///
/// Como son COUNT(*) en BD, sigue siendo rápido con miles de usuarios.
/// </summary>
public record GetUsersStatsQuery(
    string? Search,
    string? Role,
    bool? Verified = null) : IRequest<UsersStatsDto>;

public record UsersStatsDto(
    int Total,
    int Activos,
    int Pasajeros,
    int Conductores,
    int Verificados,
    int NoVerificados);

public class GetUsersStatsHandler
    : IRequestHandler<GetUsersStatsQuery, UsersStatsDto> {
    private readonly IUserRepository _users;
    public GetUsersStatsHandler(IUserRepository users) => _users = users;

    public async Task<UsersStatsDto> Handle(GetUsersStatsQuery q, CancellationToken ct) {
        var (total, activos, pasajeros, conductores, verificados, noVerificados) =
            await _users.GetStatsAsync(q.Search, q.Role, q.Verified, ct);
        return new UsersStatsDto(total, activos, pasajeros, conductores,
            verificados, noVerificados);
    }
}
