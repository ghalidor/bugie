namespace Bugie.Drivers.Application.Services.Location;

/// <summary>
/// Un punto GPS ya validado de un conductor. Es lo que viaja por la cola interna
/// y lo que se guarda en memoria como ultima posicion.
/// RecordedAtUtc: hora del punto (UTC). ReceivedAtUtc: cuando llego al servidor.
/// </summary>
public sealed record DriverLocationSample(
    Guid DriverId,
    Guid UserId,
    double Lat,
    double Lng,
    double? SpeedKmh,
    double? Heading,
    Guid? TripId,
    DateTime RecordedAtUtc,
    DateTime ReceivedAtUtc);

/// <summary>Punto de entrada del endpoint por lotes (hora de Peru sin zona, como el resto de la API).</summary>
public sealed record LocationPointInput(double Lat, double Lng, DateTime RecordedAt,
                                        double? SpeedKmh = null, double? Heading = null);

/// <summary>Resultado de procesar uno o varios puntos.</summary>
public sealed record LocationIngestResult(int Received, int Accepted, int Discarded);
