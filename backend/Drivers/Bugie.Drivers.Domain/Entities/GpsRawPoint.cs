namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Una fila cruda de drivers.locationhistory tal como se archiva y se lee del
/// historial frio (Parquet). Solo lectura: la ingesta usa LocationHistory.
/// </summary>
public record GpsRawPoint(
    long     Id,
    Guid     DriverId,
    Guid?    TripId,
    double   Lat,
    double   Lng,
    double?  SpeedKmh,
    double?  Heading,
    DateTime RecordedAt);
