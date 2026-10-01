namespace Bugie.Rewards.Domain.External;

public record UserFcmToken(Guid UserId, string Token, string? Platform);

/// <summary>
/// Puerto hacia Auth para consultar los tokens FCM de los usuarios.
/// Rewards no toca la tabla auth.userfcmtokens: la pide por HTTP interno,
/// igual que hace Trips.
/// </summary>
public interface IAuthTokensClient
{
    Task<List<UserFcmToken>> GetTokensAsync(IEnumerable<Guid> userIds, CancellationToken ct = default);

    /// <summary>Borra un token que Firebase reporto como muerto.</summary>
    Task DeleteTokenAsync(string token, CancellationToken ct = default);
}
