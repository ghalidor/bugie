namespace Bugie.Trips.Domain.Entities;

public class TripWaypoint
{
    public Guid   Id        { get; set; } = Guid.NewGuid();
    public Guid   TripId    { get; set; }
    public string Address   { get; set; } = string.Empty;
    public double Lat       { get; set; }
    public double Lng       { get; set; }
    public int    SortOrder { get; set; }
}
