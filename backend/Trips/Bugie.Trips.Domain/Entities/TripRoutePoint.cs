namespace Bugie.Trips.Domain.Entities;

public class TripRoutePoint
{
    public long     Id         { get; private set; }
    public Guid     TripId     { get; private set; }
    public double   Lat        { get; private set; }
    public double   Lng        { get; private set; }
    public double?  SpeedKmh   { get; private set; }
    public DateTime RecordedAt { get; private set; }

    private TripRoutePoint() { }

    public static TripRoutePoint Create(Guid tripId, double lat, double lng,
                                         double? speed = null) => new()
    {
        TripId     = tripId,
        Lat        = lat,
        Lng        = lng,
        SpeedKmh   = speed,
        RecordedAt = DateTime.UtcNow,
    };
}
