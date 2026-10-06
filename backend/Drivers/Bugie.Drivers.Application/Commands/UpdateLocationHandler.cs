using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

/// <summary>
/// Handler que procesa cada update de GPS del conductor.
/// Flujo:
///   1. Actualiza la última posición en drivers.Drivers (lo que ve el admin).
///   2. Si hay viaje activo, guarda en LocationHistory para auditoría.
///   3. Notifica vía SignalR (a través de Trips.Api) para que el admin vea
///      el movimiento en tiempo real sin esperar al polling de 60s.
///
/// El paso 3 es "fire-and-forget" — si Trips.Api está caído o tarda en
/// responder, el GPS ya está persistido en BD y el admin se enterará en
/// el siguiente poll. Por eso usamos timeout corto (3s) en el HttpClient.
/// </summary>
public class UpdateLocationHandler : IRequestHandler<UpdateLocationCommand, Unit>
{
    private readonly IDriverRepository _drivers;
    private readonly ILocationHistoryRepository _history;
    private readonly ITripsNotifyClient _notify;

    public UpdateLocationHandler(
        IDriverRepository d,
        ILocationHistoryRepository h,
        ITripsNotifyClient notify)
        => (_drivers, _history, _notify) = (d, h, notify);

    public async Task<Unit> Handle(UpdateLocationCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");

        // Siempre actualizamos la última ubicación en la tabla de drivers
        // (UPSERT lógico: solo cambian 2 columnas). Esto es lo que ve el admin.
        d.UpdateLocation(cmd.Lat, cmd.Lng);
        await _drivers.UpdateAsync(d, ct);

        // Sólo guardamos en LocationHistory si hay un viaje en curso.
        // Sin viaje no hay nada que auditar y la tabla crecería sin control
        // (cada conductor online generaría miles de filas al día).
        if(cmd.TripId is not null)
        {
            await _history.AddAsync(
                LocationHistory.Create(
                    d.Id, cmd.Lat, cmd.Lng, cmd.TripId, cmd.Speed, cmd.Heading),
                ct);
        }

        // Broadcast SignalR vía Trips.Api. Fire-and-forget: si falla, no
        // hace nada — el dato ya está en BD y el polling de respaldo lo
        // mostrará al admin. hasActiveTrip = true si vino TripId.
        // speedKmh y heading viajan tambien: Trips se los manda al pasajero del viaje.
        await _notify.NotifyDriverLocationAsync(
            cmd.UserId, cmd.Lat, cmd.Lng,
            hasActiveTrip: cmd.TripId is not null,
            speedKmh: cmd.Speed, heading: cmd.Heading,
            ct: ct);

        return Unit.Value;
    }
}
