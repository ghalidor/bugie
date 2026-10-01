using MediatR;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class ActivateSosHandler : IRequestHandler<ActivateSosCommand, Guid>
{
    private readonly ITripRepository _trips;
    private readonly ISosRepository _sos;
    /// <summary>
    /// Notifica al panel admin en tiempo real (SignalR). Si falla, no rompe
    /// la creación del SOS — el admin lo verá en el próximo poll.
    /// </summary>
    private readonly IAdminNotifier _notifier;

    public ActivateSosHandler(ITripRepository trips, ISosRepository sos, IAdminNotifier notifier)
        => (_trips, _sos, _notifier) = (trips, sos, notifier);

    public async Task<Guid> Handle(ActivateSosCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        trip.ActivateSos();
        await _trips.UpdateAsync(trip, ct);

        var alert = SosAlert.Create(cmd.TripId, cmd.UserId, cmd.UserRole, cmd.Lat, cmd.Lng);
        await _sos.AddAsync(alert, ct);

        // Notificar al admin (no bloqueante en términos de error: si el hub
        // falla, igual devolvemos el alert.Id porque ya está persistido).
        await _notifier.NotifySosAsync(cmd.TripId, cmd.UserId, cmd.UserRole, cmd.Lat, cmd.Lng, ct);

        return alert.Id;
    }
}