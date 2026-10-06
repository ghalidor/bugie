using MediatR;
using Bugie.Drivers.Application.Services.Location;

namespace Bugie.Drivers.Application.Commands;

/// <summary>
/// Handler de un punto GPS del conductor (PUT /api/drivers/location).
/// Pasa por el mismo camino que el lote (LocationIngestService):
///   1. valida el punto y resuelve el conductor (cache en memoria),
///   2. filtra puntos repetidos y deja la posición en memoria (DriverLiveLocations),
///   3. encola el punto; el LocationWriterService escribe en la base por lotes
///      (última posición en drivers.Drivers e historial si hay TripId) y avisa a
///      Trips (SignalR / desvío) en segundo plano.
/// La petición no escribe en la base ni espera a Trips.
/// Lanza KeyNotFoundException si el usuario no es conductor (404).
/// </summary>
public class UpdateLocationHandler : IRequestHandler<UpdateLocationCommand, Unit>
{
    private readonly LocationIngestService _ingest;

    public UpdateLocationHandler(LocationIngestService ingest) => _ingest = ingest;

    public async Task<Unit> Handle(UpdateLocationCommand cmd, CancellationToken ct)
    {
        await _ingest.IngestAsync(cmd.UserId, cmd.Lat, cmd.Lng, cmd.TripId, cmd.Speed, cmd.Heading, ct);
        return Unit.Value;
    }
}
