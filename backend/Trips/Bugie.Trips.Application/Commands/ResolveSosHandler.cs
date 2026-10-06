using MediatR;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

/// <summary>
/// Comando para que un admin desactive una alerta SOS.
/// El motivo es obligatorio para auditoría.
/// </summary>
public record ResolveSosCommand(Guid AlertId, Guid AdminId, string Reason) : IRequest<Unit>;

public class ResolveSosHandler : IRequestHandler<ResolveSosCommand, Unit>
{
    private readonly ISosRepository _sos;
    private readonly ITripRepository _trips;
    /// <summary>Tiempo real a pasajero y conductor del viaje (hub /hubs/trips). Nunca lanza.</summary>
    private readonly ITripRealtimeNotifier _realtime;

    public ResolveSosHandler(ISosRepository sos, ITripRepository trips, ITripRealtimeNotifier realtime)
    {
        _sos = sos;
        _trips = trips;
        _realtime = realtime;
    }

    public async Task<Unit> Handle(ResolveSosCommand cmd, CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(cmd.Reason))
            throw new ArgumentException("El motivo de desactivación es obligatorio.");

        var alert = await _sos.GetByIdAsync(cmd.AlertId, ct)
            ?? throw new KeyNotFoundException("Alerta no encontrada.");

        if(alert.Resolved)
            throw new InvalidOperationException("La alerta ya está desactivada.");

        // 1) Marcar TODAS las alertas activas del viaje como resueltas.
        //    Antes solo resolvíamos la alerta del cmd.AlertId, lo que dejaba
        //    alertas huérfanas (de activaciones anteriores que el admin no veía
        //    en monitoreo). Esas alertas mantenían el Trip.Status en SosActive
        //    aunque el admin "creía" haber resuelto.
        //    Ahora: si el admin resuelve UNA, se resuelven TODAS del viaje
        //    con el mismo motivo y admin. El Trip.Status vuelve a su estado normal.
        var resolvedCount = await _sos.ResolveAllActiveByTripAsync(
            alert.TripId, cmd.AdminId, cmd.Reason.Trim(), ct);

        // 2) Volver el viaje a su estado natural (Accepted 2 si no había arrancado,
        //    InProgress 3 si ya estaba en curso).
        var trip = await _trips.GetByIdAsync(alert.TripId, ct);
        if(trip is not null)
        {
            trip.ResolveSos();
            await _trips.UpdateAsync(trip, ct);
            // El viaje vuelve a su estado normal: la app quita el aviso de SOS.
            _ = _realtime.TripChangedAsync(trip, RealtimeReasons.SosResolved);
        }

        return Unit.Value;
    }
}
