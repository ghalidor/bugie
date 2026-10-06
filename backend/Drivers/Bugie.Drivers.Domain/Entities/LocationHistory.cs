namespace Bugie.Drivers.Domain.Entities;

public class LocationHistory
{
    public long      Id         { get; private set; }
    public Guid      DriverId   { get; private set; }
    public Guid?     TripId     { get; private set; }
    public double    Lat        { get; private set; }
    public double    Lng        { get; private set; }
    public double?   SpeedKmh   { get; private set; }
    public double?   Heading    { get; private set; }
    public DateTime  RecordedAt { get; private set; }

    private LocationHistory() { }

    /// <summary>recordedAtUtc: hora del punto (UTC). Si no viene, la hora actual del servidor.</summary>
    public static LocationHistory Create(Guid driverId, double lat, double lng,
                                          Guid? tripId = null, double? speed = null,
                                          double? heading = null, DateTime? recordedAtUtc = null) => new()
    {
        DriverId   = driverId,
        TripId     = tripId,
        Lat        = lat,
        Lng        = lng,
        SpeedKmh   = speed,
        Heading    = heading,
        RecordedAt = recordedAtUtc ?? DateTime.UtcNow,
    };
}
