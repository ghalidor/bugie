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

    // ── Reserva del cupon en un viaje ───────────────────────────────────

    /// <summary>
    /// Reserva el cupon para ese viaje, de forma atomica: solo si es del
    /// usuario y sigue 'active' y vigente (o ya estaba reservado para ESE
    /// mismo viaje: reintento). False si otro proceso se adelanto.
    /// </summary>
    Task<bool> TryReserveAsync(Guid redemptionId, Guid userId, Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Libera la reserva de ese viaje: vuelve a 'active', o a 'expired' si ya
    /// paso su fecha. requestedAtUtc: si llega, no se libera una reserva hecha
    /// DESPUES (el pasajero volvio a aplicar el cupon). Devuelve el estado
    /// nuevo, o null si no habia nada que liberar.
    /// </summary>
    Task<string?> ReleaseAsync(string code, Guid tripId, DateTime? requestedAtUtc, CancellationToken ct = default);

    /// <summary>
    /// Consume el cupon en ese viaje ('used'), de forma atomica: si estaba
    /// reservado para ese viaje (aunque haya pasado su fecha mientras el
    /// viaje seguia) o, por compatibilidad, si seguia 'active' y vigente.
    /// </summary>
    Task<bool> TryConsumeForTripAsync(Guid redemptionId, Guid tripId, string note, CancellationToken ct = default);

    /// <summary>
    /// Red de seguridad: libera reservas cuyo viaje ya se cancelo, ya no
    /// lleva el cupon o no existe (por si se perdio el aviso de Trips).
    /// Solo reservas con mas de graceMinutes. Devuelve cuantas.
    /// </summary>
    Task<int> ReleaseOrphanReservationsAsync(int graceMinutes, CancellationToken ct = default);

    /// <summary>
    /// Red de seguridad: reservas cuyo viaje ya se completo hace mas de
    /// graceMinutes y siguen sin consumirse (el aviso de Trips no llego).
    /// AppliedDiscount = lo que de verdad se desconto (tarifa - cobrado).
    /// </summary>
    Task<List<PendingTripCoupon>> GetUnconsumedCompletedAsync(int graceMinutes, CancellationToken ct = default);
}

/// <summary>Cupon reservado en un viaje ya completado que falta consumir.</summary>
public class PendingTripCoupon
{
    public string  Code            { get; set; } = string.Empty;
    public Guid    TripId          { get; set; }
    public decimal AppliedDiscount { get; set; }
}
