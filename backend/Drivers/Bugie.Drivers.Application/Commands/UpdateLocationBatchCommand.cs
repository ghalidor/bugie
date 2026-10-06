using MediatR;
using Bugie.Drivers.Application.Services.Location;

namespace Bugie.Drivers.Application.Commands;

/// <summary>Varios puntos GPS del mismo conductor (PUT /api/drivers/location/batch).</summary>
public record UpdateLocationBatchCommand(
    Guid UserId, Guid? TripId, IReadOnlyList<LocationPointInput> Points) : IRequest<LocationIngestResult>;

public class UpdateLocationBatchHandler : IRequestHandler<UpdateLocationBatchCommand, LocationIngestResult>
{
    private readonly LocationIngestService _ingest;
    public UpdateLocationBatchHandler(LocationIngestService ingest) => _ingest = ingest;

    public Task<LocationIngestResult> Handle(UpdateLocationBatchCommand cmd, CancellationToken ct) =>
        _ingest.IngestAsync(cmd.UserId, cmd.TripId, cmd.Points, ct);
}
