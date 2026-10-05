using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

/// <summary>Pasajero a revisar para el aviso mensual de beneficios de nivel.</summary>
public class LevelBenefitNoticeCandidate
{
    public Guid   UserId       { get; set; }
    public string CurrentLevel { get; set; } = string.Empty;
}

/// <summary>
/// Cupones de beneficio de nivel (pasajero): cuantos reclamo en el mes y el
/// marcador del aviso mensual.
///
/// period = 'YYYY-MM' del mes local de Peru.
/// </summary>
public interface ILevelBenefitRepository
{
    /// <summary>
    /// Cupones reclamados en el mes, por tipo ('discount' / 'free_trip').
    /// No cuenta los que el admin anulo: ese cupo vuelve a quedar libre.
    /// </summary>
    Task<Dictionary<string, int>> CountClaimsAsync(
        Guid userId, string period, CancellationToken ct = default);

    /// <summary>
    /// Reclama un cupon en UNA transaccion: bloquea al usuario, vuelve a
    /// contar lo usado del mes y, si todavia hay cupo, crea el cupon y el
    /// registro del reclamo. Un doble clic no da dos cupones.
    ///
    /// Devuelve false si ya no quedaba cupo.
    /// </summary>
    Task<bool> ClaimAsync(
        Redemption redemption, string benefitType, string period,
        string levelName, int monthlyLimit, CancellationToken ct = default);

    /// <summary>Pasajeros que todavia no recibieron el aviso de este mes.</summary>
    Task<List<LevelBenefitNoticeCandidate>> GetPassengersWithoutNoticeAsync(
        string period, CancellationToken ct = default);

    /// <summary>
    /// Marca "ya se aviso este mes". Devuelve false si ya estaba marcado
    /// (otro proceso se adelanto).
    /// </summary>
    Task<bool> TryMarkNoticeAsync(Guid userId, string period, CancellationToken ct = default);
}
