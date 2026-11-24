using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IPointsProfileRepository
{
    Task<PointsProfile?> GetByUserIdAsync(Guid userId, CancellationToken ct = default);
    Task AddAsync(PointsProfile profile, CancellationToken ct = default);

    /// <summary>
    /// Inserta el perfil si el usuario todavia no tiene uno y devuelve el que
    /// quedo guardado. Si dos peticiones lo crean a la vez, gana la primera y
    /// ambas reciben el mismo perfil (no falla por el indice unico).
    /// </summary>
    Task<PointsProfile> GetOrAddAsync(PointsProfile candidate, CancellationToken ct = default);

    /// <summary>Corrige el tipo de perfil (pasajero/conductor).</summary>
    Task UpdateUserTypeAsync(PointsProfile profile, CancellationToken ct = default);

    /// <summary>
    /// Guarda la acumulacion de forma atomica: inserta el movimiento en el libro
    /// y actualiza el saldo del perfil dentro de una sola transaccion.
    ///
    /// El saldo se suma en la base (saldo = saldo + puntos) con la fila del
    /// perfil bloqueada, y BalanceBefore/BalanceAfter del libro salen de ese
    /// saldo real, no del que se leyo antes: dos operaciones a la vez no se
    /// pisan. Al terminar, el perfil en memoria queda con el saldo real.
    ///
    /// Devuelve false si ese movimiento ya existia (mismo perfil, mismo evento y
    /// misma referencia). En ese caso no se toca el saldo. Asi, si el outbox
    /// reintenta el mismo viaje, no se acreditan puntos dos veces.
    /// </summary>
    Task<bool> ApplyEarnAsync(PointsProfile profile, PointsTransaction transaction,
                              CancellationToken ct = default);

    /// <summary>
    /// Registra el logro y acredita sus puntos en la MISMA transaccion: si el
    /// abono falla, el logro no queda marcado (y se puede volver a intentar).
    /// Devuelve false si el logro ya estaba pagado para ese periodo.
    /// </summary>
    Task<bool> ApplyMilestoneAsync(PointsProfile profile, PointsTransaction transaction,
                                   MilestoneAward award, CancellationToken ct = default);

    /// <summary>Perfiles con saldo cuya fecha de vencimiento ya paso.</summary>
    Task<List<PointsProfile>> GetExpiredAsync(int limit, CancellationToken ct = default);

    /// <summary>
    /// Guarda un ajuste manual: perfil, movimiento y auditoría, en una sola
    /// transacción. Con control de concurrencia como el canje: si el saldo
    /// cambió entre la lectura y la escritura, devuelve false.
    /// </summary>
    Task<bool> ApplyAdjustmentAsync(
        PointsProfile profile, PointsTransaction transaction,
        int expectedBalance, string reason, Guid? adminId,
        CancellationToken ct = default);

    /// <summary>
    /// Perfiles con saldo a los que les vence dentro de 'withinDays' y a los
    /// que todavia no se les aviso por esa fecha.
    /// </summary>
    Task<List<PointsProfile>> GetPendingWarningAsync(
        int withinDays, int limit, CancellationToken ct = default);

    /// <summary>
    /// Vence el saldo en una transaccion: registra el movimiento 'expire' y
    /// pone el saldo en cero.
    ///
    /// El UPDATE exige que el saldo siga siendo el mismo que leimos. Si el
    /// usuario gano puntos justo en ese instante, devuelve false y no se le
    /// vence nada: en la proxima pasada se vuelve a evaluar con la fecha nueva.
    /// </summary>
    Task<bool> ApplyExpirationAsync(
        PointsProfile profile, PointsTransaction movement, CancellationToken ct = default);

    /// <summary>Marca que ya se envio el aviso de vencimiento.</summary>
    Task MarkWarningSentAsync(PointsProfile profile, CancellationToken ct = default);

    Task<(List<PointsProfile> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? userType, CancellationToken ct = default);
}
