namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Cliente HTTP a Auth.Api. Reemplaza los JOIN cross-database hacia BugieAuth.auth.Users.
/// Interfaz en Domain (contrato) — implementación en Infrastructure.
/// </summary>
public interface IAuthClient
{
    Task<Dictionary<Guid, UserInfoDto>> GetUsersByIdsAsync(
        IEnumerable<Guid> ids, CancellationToken ct = default);
}
