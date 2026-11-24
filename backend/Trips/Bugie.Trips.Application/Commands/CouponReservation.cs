using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

/// <summary>
/// Liberar la reserva del cupon en Rewards cuando el viaje ya no lo lleva
/// (el pasajero lo quito o el viaje se cancelo).
///
/// Se intenta al momento, para que el pasajero pueda usarlo enseguida en otro
/// viaje. Si Rewards no responde, queda en la bandeja de salida y se libera
/// cuando vuelva. Nunca lanza: el viaje ya cambio y eso es lo importante.
/// </summary>
public static class CouponReservation
{
    public static async Task ReleaseAsync(
        IRewardsClient rewards, IOutboxRepository outbox,
        Guid tripId, string? code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) return;

        var requestedAt = DateTime.UtcNow;
        if (await rewards.ReleaseCouponAsync(code, tripId, requestedAt, ct)) return;

        try
        {
            await outbox.AddAsync(OutboxEvent.CouponReleased(tripId, code, requestedAt), ct);
            Console.Error.WriteLine(
                $"[Cupon] Rewards no respondio al liberar {code} del viaje {tripId}: queda en la bandeja de salida.");
        }
        catch (Exception ex)
        {
            // Ultima red: Rewards libera solo las reservas de viajes que ya no
            // llevan el cupon (RedemptionExpirationService).
            Console.Error.WriteLine(
                $"[Cupon] No se pudo encolar la liberacion de {code} del viaje {tripId}: {ex.Message}");
        }
    }
}
