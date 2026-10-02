namespace Bugie.Payments.Domain.Entities;

public class Payment
{
    public Guid      Id           { get; private set; }
    public Guid      TripId       { get; private set; }
    public Guid      PassengerId  { get; private set; }
    public Guid      DriverId     { get; private set; }
    public decimal   Amount       { get; private set; }
    public decimal   PlatformFee  { get; private set; }

    /// <summary>
    /// El porcentaje con el que se cobro ESTE pago (10.00 = 10%).
    ///
    /// Se congela aca a proposito. Para saber con cuanto se cobro un viaje de
    /// hace tres meses no sirve mirar la configuracion de hoy, que pudo
    /// cambiar: el dato pertenece al registro del viaje.
    /// </summary>
    public decimal   PlatformFeeRate { get; private set; }
    public decimal   DriverAmount { get; private set; }
    public string    Method       { get; private set; }
    public string    Status       { get; private set; }
    public string?   Reference    { get; private set; }
    public DateTime  CreatedAt    { get; private set; }
    public DateTime? PaidAt       { get; private set; }

    private Payment() { }

    public static Payment Create(Guid tripId, Guid passengerId, Guid driverId,
                                  decimal amount, string method,
                                  decimal platformFeePercent) => new()
    {
        Id           = Guid.NewGuid(),
        TripId       = tripId,
        PassengerId  = passengerId,
        DriverId     = driverId,
        Amount          = amount,
        PlatformFeeRate = platformFeePercent,

        // La comision sale del monto PAGADO. Si el viaje salio gratis por un
        // cupon, amount es 0 y no hay comision que cobrar: el conductor no
        // cobro nada, seria injusto que ademas debiera.
        PlatformFee  = amount <= 0 ? 0
                     : Math.Round(amount * platformFeePercent / 100m, 2),
        DriverAmount = amount <= 0 ? 0
                     : Math.Round(amount * (1 - platformFeePercent / 100m), 2),
        Method       = method,
        Status       = "pending",
        CreatedAt    = DateTime.UtcNow,
    };

    public void Complete(string? reference = null)
    {
        Status    = "completed";
        Reference = reference;
        PaidAt    = DateTime.UtcNow;
    }

    public void Refund() => Status = "refunded";
    public void Fail()   => Status = "failed";
}
