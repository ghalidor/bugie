using MediatR;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

/// <summary>
/// Handler que procesa el GPS del pasajero durante un viaje activo.
/// Flujo:
///   1. Actualiza columnas PassengerLastLat/Lng/At en trips.Trips.
///   2. Si había viaje activo (devolvió tripId), notifica al admin
///      vía SignalR para que el pin del pasajero se mueva sin polling.
///
/// Tolerancia a fallos:
///   - Si el pasajero no tiene viaje activo, no hace nada (sin error).
///   - Si SignalR está caído, el broadcast falla silenciosamente.
///     El dato siempre queda en BD; el admin lo verá en el próximo poll.
/// </summary>
public class UpdatePassengerLocationHandler
    : IRequestHandler<UpdatePassengerLocationCommand, Unit>
{
    private readonly ITripRepository _trips;
    private readonly IAdminNotifier _notifier;

    public UpdatePassengerLocationHandler(ITripRepository trips, IAdminNotifier notifier)
        => (_trips, _notifier) = (trips, notifier);

    public async Task<Unit> Handle(UpdatePassengerLocationCommand cmd, CancellationToken ct)
    {
        // No lanzamos error si el pasajero no tiene viaje activo.
        // El cliente puede mandar updates "tardíos" después de cancelar/completar
        // por race conditions de red. Mejor ignorar silenciosamente.
        var tripId = await _trips.UpdatePassengerLocationAsync(
            cmd.PassengerId, cmd.Lat, cmd.Lng, ct);

        // Broadcast solo si efectivamente había viaje activo. Si no hay
        // viaje, el admin no necesita ver al pasajero en el mapa.
        if(tripId is not null)
        {
            await _notifier.NotifyPassengerLocationAsync(
                cmd.PassengerId, tripId.Value, cmd.Lat, cmd.Lng, ct);
        }
        return Unit.Value;
    }
}
