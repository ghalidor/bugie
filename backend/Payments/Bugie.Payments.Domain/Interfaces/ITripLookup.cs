namespace Bugie.Payments.Domain.Interfaces;

/// <summary>Datos del viaje que Payments necesita para validar un pago.</summary>
public class TripForPayment
{
    public Guid     Id            { get; set; }
    public Guid     PassengerId   { get; set; }
    public Guid?    DriverId      { get; set; }
    /// <summary>4 = completado (TripStatus de Trips).</summary>
    public short    Status        { get; set; }
    /// <summary>Monto final cobrado (ya con el descuento del cupon).</summary>
    public decimal? FinalFare     { get; set; }
    public string   PaymentMethod { get; set; } = "";
}

/// <summary>Lee el viaje (trips.trips) para validar que el pago corresponde.</summary>
public interface ITripLookup
{
    Task<TripForPayment?> GetAsync(Guid tripId, CancellationToken ct = default);
}
