using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IRedemptionRepository
{
    /// <summary>
    /// Ejecuta el canje completo en UNA transaccion:
    ///   1. descuenta los puntos del perfil, solo si el saldo alcanza
    ///   2. registra el movimiento en el libro
    ///   3. crea el cupon
    ///   4. descuenta una unidad del stock, si el item lleva stock
    ///
    /// El descuento de puntos usa un WHERE con el saldo esperado. Si dos
    /// solicitudes llegan al mismo tiempo, solo una prospera: la otra recibe
    /// false y no se descuenta nada dos veces.
    ///
    /// Devuelve false si el saldo ya no alcanzaba o si el stock se agoto.
    /// </summary>
    Task<bool> ApplyRedemptionAsync(
        PointsProfile profile, PointsTransaction movement,
        Redemption redemption, bool decrementStock,
        CancellationToken ct = default);

    /// <summary>Anula un cupon y devuelve los puntos, en una transaccion.</summary>
    Task<bool> ApplyRefundAsync(
        PointsProfile profile, PointsTransaction movement,
        Redemption redemption, CancellationToken ct = default);

    /// <summary>
    /// Anula un cupon que no costo puntos (beneficio de nivel): solo cambia
    /// su estado, no hay nada que devolver. False si ya no estaba activo.
    /// </summary>
    Task<bool> CancelWithoutRefundAsync(Redemption redemption, CancellationToken ct = default);

    /// <summary>Cupones activos y vigentes de un usuario de un tipo, el que vence primero arriba.</summary>
    Task<List<Redemption>> GetActiveByTypeAsync(
        Guid userId, string rewardType, CancellationToken ct = default);

    Task<Redemption?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Redemption?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task UpdateAsync(Redemption redemption, CancellationToken ct = default);

    Task<(List<Redemption> Items, int Total)> GetByUserAsync(
        Guid userId, string? status, int page, int pageSize, CancellationToken ct = default);

    Task<(List<Redemption> Items, int Total)> GetPagedAsync(
        string? status, string? userType, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Marca como 'expired' los cupones vencidos. Devuelve cuantos.</summary>
    Task<int> ExpireOverdueAsync(CancellationToken ct = default);
}
