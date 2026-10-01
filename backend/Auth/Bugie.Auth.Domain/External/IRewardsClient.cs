namespace Bugie.Auth.Domain.External;

/// <summary>
/// Avisa al módulo Rewards cuando alguien se registra con un código de
/// invitación. Es el único punto donde Auth sabe que Rewards existe.
/// </summary>
public interface IRewardsClient
{
    /// <summary>
    /// Registra el referido. Devuelve false si no se pudo avisar.
    ///
    /// Nunca lanza excepción: el usuario YA quedó creado y no tiene sentido
    /// tumbar un registro porque el programa de puntos no respondió.
    /// </summary>
    Task<bool> RegisterReferralAsync(
        Guid newUserId, string userType, string code, string email,
        CancellationToken ct = default);
}
