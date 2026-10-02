using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Domain.Entities;

public class Trip
{
    public Guid Id { get; set; }
    public Guid PassengerId { get; set; }
    public Guid? DriverId { get; set; }
    public Guid? VehicleId { get; set; }
    public string OriginAddress { get; set; } = string.Empty;
    public double OriginLat { get; set; }
    public double OriginLng { get; set; }
    public string DestAddress { get; set; } = string.Empty;
    public double DestLat { get; set; }
    public double DestLng { get; set; }
    public double? DistanceKm { get; set; }
    public decimal EstimatedFare { get; set; }
    public decimal? ProposedFare { get; set; }  // Tarifa propuesta por conductor
    public Guid? ProposedDriverId { get; set; }  // Conductor que propuso
    public decimal? FinalFare { get; set; }

    // -- Cupon aplicado --
    public string?  CouponCode         { get; set; }
    public decimal? DiscountAmount     { get; set; }
    /// <summary>Tarifa antes del descuento. Sin esto no se puede auditar nada.</summary>
    public decimal? FareBeforeDiscount { get; set; }

    /// <summary>Lo que el pasajero paga de verdad, ya con el descuento.</summary>
    public decimal AmountToPay =>
        (FinalFare ?? EstimatedFare) - (DiscountAmount ?? 0);
    public string PaymentMethod { get; set; } = string.Empty;
    public TripStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public DateTime? DriverArrivedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? CancelledBy { get; set; }
    public string? CancelReason { get; set; }
    /// <summary>Cuándo se canceló (null si no se canceló).</summary>
    public DateTime? CancelledAt { get; set; }

    // ---- Envio (Delivery) ----
    public ServiceType ServiceType { get; set; } = ServiceType.Ride;
    public string? PackageDescription { get; set; }
    public decimal? PackageWeightKg { get; set; }
    public bool PackageIsFragile { get; set; }
    public string? PackageDetails { get; set; }

    // Verificacion del paquete al recoger (solo Delivery)
    public bool PickupVerified { get; set; }
    public string? PickupObservation { get; set; }

    // Fotos: paquete del cliente (solicitud) + verificacion del conductor (pickup)
    public List<TripPhoto> Photos { get; set; } = new();

    public static Trip Create(
        Guid passengerId,
        string originAddress, double originLat, double originLng,
        string destAddress, double destLat, double destLng,
        decimal estimatedFare, string paymentMethod,
        double? distanceKm = null,
        // Envio (opcionales; para Ride quedan en sus valores por defecto)
        ServiceType serviceType = ServiceType.Ride,
        string? packageDescription = null,
        decimal? packageWeightKg = null,
        bool packageIsFragile = false,
        string? packageDetails = null) => new()
        {
            Id = Guid.NewGuid(),
            PassengerId = passengerId,
            OriginAddress = originAddress,
            OriginLat = originLat,
            OriginLng = originLng,
            DestAddress = destAddress,
            DestLat = destLat,
            DestLng = destLng,
            DistanceKm = distanceKm,
            EstimatedFare = estimatedFare,
            PaymentMethod = paymentMethod,
            ServiceType = serviceType,
            PackageDescription = packageDescription,
            PackageWeightKg = packageWeightKg,
            PackageIsFragile = packageIsFragile,
            PackageDetails = packageDetails,
            Status = TripStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        };

    public void Accept(Guid driverId, Guid? vehicleId = null)
    {
        if(Status != TripStatus.Pending && Status != TripStatus.Negotiating)
            throw new InvalidOperationException("Solo se puede aceptar un viaje pendiente.");
        DriverId = driverId;
        VehicleId = vehicleId;
        ProposedFare = null;
        ProposedDriverId = null;
        Status = TripStatus.Accepted;
        AcceptedAt = DateTime.UtcNow;
    }

    // Conductor propone tarifa diferente
    public void ProposeFare(Guid driverId, decimal fare)
    {
        if(Status != TripStatus.Pending && Status != TripStatus.Negotiating)
            throw new InvalidOperationException("Solo se puede proponer tarifa en viaje pendiente.");
        ProposedFare = fare;
        ProposedDriverId = driverId;
        Status = TripStatus.Negotiating;
    }

    // Pasajero acepta la tarifa propuesta
    public void AcceptProposedFare()
    {
        if(Status != TripStatus.Negotiating || ProposedFare is null || ProposedDriverId is null)
            throw new InvalidOperationException("No hay tarifa propuesta para aceptar.");
        EstimatedFare = ProposedFare.Value;
        DriverId = ProposedDriverId;
        ProposedFare = null;
        ProposedDriverId = null;
        Status = TripStatus.Accepted;
        AcceptedAt = DateTime.UtcNow;
    }

    // Pasajero rechaza la tarifa propuesta
    public void RejectProposedFare()
    {
        if(Status != TripStatus.Negotiating)
            throw new InvalidOperationException("No hay tarifa propuesta.");
        ProposedFare = null;
        ProposedDriverId = null;
        Status = TripStatus.Pending;
    }

    // El conductor avisa que ya esta en el punto de recojo (antes de iniciar).
    // Se guarda la primera vez; si vuelve a avisar se conserva esa hora.
    public void MarkDriverArrived()
    {
        if (Status != TripStatus.Accepted)
            throw new InvalidOperationException("Solo puedes avisar tu llegada con el viaje aceptado y antes de iniciarlo.");
        DriverArrivedAt ??= DateTime.UtcNow;
    }

    // Envio: el conductor registra la verificacion del paquete al recoger
    // (foto principal con el cliente + fotos secundarias + observacion).
    // Las fotos se agregan a Photos; aqui se marca la verificacion como hecha.
    public void SubmitPickupVerification(string? observation)
    {
        if(ServiceType != ServiceType.Delivery)
            throw new InvalidOperationException("La verificacion de paquete solo aplica a envios.");
        if(Status != TripStatus.Accepted)
            throw new InvalidOperationException("El envio debe estar aceptado para verificar el paquete.");
        PickupObservation = observation;
        PickupVerified = true;
    }

    public void Start()
    {
        if(Status != TripStatus.Accepted)
            throw new InvalidOperationException("El viaje debe estar aceptado para iniciar.");
        // En envios no se puede iniciar (paquete a bordo) sin verificar el paquete.
        if(ServiceType == ServiceType.Delivery && !PickupVerified)
            throw new InvalidOperationException("Debes verificar el paquete antes de iniciar el envio.");
        Status = TripStatus.InProgress;
        StartedAt = DateTime.UtcNow;
    }

    public void Complete(decimal finalFare)
    {
        if(Status != TripStatus.InProgress)
            throw new InvalidOperationException("El viaje debe estar en curso para completarse.");
        Status = TripStatus.Completed;
        FinalFare = finalFare;
        CompletedAt = DateTime.UtcNow;
    }

    public void Cancel(string cancelledBy, string? reason = null)
    {
        if(Status is TripStatus.Completed or TripStatus.Cancelled)
            throw new InvalidOperationException("Este viaje ya no se puede cancelar.");
        Status = TripStatus.Cancelled;
        CancelledBy = cancelledBy;
        CancelReason = reason;
        CancelledAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Deja el cupon anotado en el viaje. NO lo consume: eso pasa al
    /// completar. Si el viaje se cancela, el cupon queda libre.
    /// </summary>
    public void ApplyCoupon(string code, decimal discount, decimal fareBefore)
    {
        if(discount <= 0)
            throw new InvalidOperationException("El descuento debe ser mayor a cero.");

        if(discount > fareBefore)
            throw new InvalidOperationException(
                "El descuento no puede ser mayor que la tarifa.");

        CouponCode         = code;
        DiscountAmount     = discount;
        FareBeforeDiscount = fareBefore;
    }

    public void RemoveCoupon()
    {
        CouponCode         = null;
        DiscountAmount     = null;
        FareBeforeDiscount = null;
    }

    public bool HasCoupon => !string.IsNullOrWhiteSpace(CouponCode);

    public void ActivateSos() => Status = TripStatus.SosActive;

    /// <summary>
    /// Vuelve el viaje a su estado lógico después de desactivar el SOS.
    /// Si el viaje nunca arrancó (StartedAt es null), vuelve a Accepted.
    /// Si ya estaba en curso, vuelve a InProgress. El admin desactiva el SOS
    /// pero el viaje sigue su curso normal.
    /// </summary>
    public void ResolveSos()
    {
        // Sanidad: si por alguna razón no estaba en SosActive, no tocar nada.
        if(Status != TripStatus.SosActive) return;
        Status = StartedAt is null ? TripStatus.Accepted : TripStatus.InProgress;
    }
}
