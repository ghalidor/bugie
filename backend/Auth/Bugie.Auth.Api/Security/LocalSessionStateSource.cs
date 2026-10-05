using Bugie.Auth.Domain.Interfaces;
using Bugie.Security;

namespace Bugie.Auth.Api.Security;

/// <summary>
/// Estado de sesion dentro de Auth: lectura directa de la BD en cada request
/// (sin HTTP ni cache: un cierre de sesiones se aplica al instante en Auth).
/// Las otras APIs usan HttpSessionStateSource (endpoint interno + cache corta).
/// </summary>
public sealed class LocalSessionStateSource : ISessionStateSource
{
    private readonly IUserRepository _users;
    private readonly ILogger<LocalSessionStateSource> _log;

    public LocalSessionStateSource(IUserRepository users, ILogger<LocalSessionStateSource> log)
        => (_users, _log) = (users, log);

    public async Task<SessionLookup> GetAsync(Guid userId, bool bypassCache, CancellationToken ct)
    {
        try
        {
            var s = await _users.GetSessionStateAsync(userId, ct);
            return s is null
                ? new SessionLookup(SessionLookupStatus.NotFound, null, DateTime.UtcNow, false)
                : new SessionLookup(SessionLookupStatus.Found, ToInfo(s), DateTime.UtcNow, false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _log.LogWarning("Sesion: no se pudo leer el estado de {UserId} ({Error}).", userId, ex.Message);
            return SessionLookup.Unavailable();
        }
    }

    public static SessionStateInfo ToInfo(Domain.Entities.UserSessionState s) => new(
        s.UserId, s.SecurityStamp, s.SecurityStampChangedAt.HasValue,
        s.IsDeleted, s.IsDeactivated, s.IsActive, s.Role);
}
