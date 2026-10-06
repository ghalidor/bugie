namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Punto GPS aceptado que se manda a Trips.Api (SignalR y desvio de ruta) por lotes.
/// At: hora del punto en UTC.
/// </summary>
public sealed record DriverLocationNotice(Guid UserId, double Lat, double Lng, bool HasActiveTrip,
                                          double? SpeedKmh, double? Heading, DateTime At);
