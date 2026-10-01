namespace Bugie.Trips.Domain.Interfaces;

public interface IRoutingService
{
    Task<RouteResult?> GetRouteAsync(
        double originLat, double originLng,
        double destLat,   double destLng,
        CancellationToken ct = default);
}

public class RouteResult
{
    public double            DistanceMeters  { get; set; }
    public double            DurationSeconds { get; set; }
    public List<RouteOption> Options         { get; set; } = new();
}

public class RouteOption
{
    public double         DistanceMeters  { get; set; }
    public double         DurationSeconds { get; set; }
    public List<double[]> Coordinates     { get; set; } = new();
}
