namespace Bugie.Drivers.Domain.Entities;

public class Vehicle
{
    public Guid Id { get; private set; }
    public Guid DriverId { get; private set; }
    public string Plate { get; private set; } = string.Empty;
    public string Brand { get; private set; } = string.Empty;
    public string Model { get; private set; } = string.Empty;
    public short Year { get; private set; }
    public string Color { get; private set; } = string.Empty;
    public string? PhotoUrl { get; private set; }   // Foto del vehículo (subida por el conductor)
    public bool IsActive { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private Vehicle() { }

    public static Vehicle Create(Guid driverId, string plate, string brand,
                                  string model, short year, string color) => new()
                                  {
                                      Id = Guid.NewGuid(),
                                      DriverId = driverId,
                                      Plate = plate.ToUpperInvariant().Trim(),
                                      Brand = brand,
                                      Model = model,
                                      Year = year,
                                      Color = color,
                                      PhotoUrl = null,
                                      IsActive = true,
                                      CreatedAt = DateTime.UtcNow,
                                  };

    public void Deactivate() => IsActive = false;

    /// <summary>Asigna o reemplaza la foto del vehículo.</summary>
    public void SetPhoto(string url) => PhotoUrl = url;
}