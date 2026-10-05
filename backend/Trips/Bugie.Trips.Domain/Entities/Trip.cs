using Bugie.Trips.Domain.Common;
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

    // Destinatario del envio (quien recibe en destino)
    public string? RecipientName { get; set; }
    public string? RecipientPhone { get; set; }

    // Verificacion del paquete al recoger (solo Delivery)
    public bool PickupVerified { get; set; }
    public string? PickupObservation { get; set; }

    // Confirmacion de entrega en destino (solo Delivery): foto + quien recibio
    public string? DeliveryReceivedBy { get; set; }
    public DateTime? DeliveryConfirmedAt { get; set; }

    // Fotos: paquete del cliente (solicitud) + verificacion del conductor (pickup)
    public List<TripPhoto> Photos { get; set; } = new();

    // ---- Programado ----
    /// <summary>Hora programada del recojo (UTC). null = viaje "ahora".</summary>
    public DateTime? ScheduledAt { get; set; }
    /// <summary>Marcas de los recordatorios push (30 y 10 min antes), para no duplicarlos.</summary>
    public DateTime? Reminder30SentAt { get; set; }
    public DateTime? Reminder10SentAt { get; set; }

    public bool IsScheduled => ScheduledAt.HasValue;

    /// <summary>
    /// Programado que todavia no "llega": no cuenta como viaje activo
    /// (ni bloquea al conductor ni al pasajero) hasta que falten
    /// ScheduledTrips.ActivateBeforeMinutes o el conductor marque llegada / inicie.
    /// </summary>
    public bool IsFutureScheduled(DateTime nowUtc) =>
        ScheduledAt.HasValue &&
        Status is TripStatus.Pending or TripStatus.Negotiating or TripStatus.Accepted &&
        DriverArrivedAt is null &&
        ScheduledAt.Value > nowUtc.AddMinutes(ScheduledTrips.ActivateBeforeMinutes);

    /// <summary>
    /// El conductor de un programado no llego: pasaron NoShowMinutes desde la
    /// hora programada y no marco "Ya llegue". El pasajero puede cancelar
    /// sin penalidad o republicar.
    /// </summary>
    public bool IsDriverLate(DateTime nowUtc) =>
        ScheduledAt.HasValue &&
        Status == TripStatus.Accepted &&
        DriverId.HasValue &&
        DriverArrivedAt is null &&
        nowUtc >= ScheduledAt.Value.AddMinutes(ScheduledTrips.NoShowMinutes);

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
        string? packageDetails = null,
        string? recipientName = null,
        string? recipientPhone = null,
        DateTime? scheduledAt = null) => new()
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
            RecipientName = recipientName,
            RecipientPhone = recipientPhone,
            ScheduledAt = scheduledAt,
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

    // El conductor avisa que ya esta en el punto de recojo (antes de iniciar).
    // Se guarda la primera vez; si vuelve a avisar se conserva esa hora.
    public void MarkDriverArrived()
    {
        if (Status != TripStatus.Accepted)
            throw new InvalidOperationException("Solo puedes avisar tu llegada con el viaje aceptado y antes de iniciarlo.");
        EnsureScheduledWindow(DateTime.UtcNow);
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
        if(PickupVerified)
            throw new InvalidOperationException("El paquete ya fue verificado.");
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
        if(DriverArrivedAt is null) EnsureScheduledWindow(DateTime.UtcNow);
        Status = TripStatus.InProgress;
        StartedAt = DateTime.UtcNow;
    }

    // Envio: el conductor confirma la entrega en destino (foto + quien recibio).
    public void ConfirmDelivery(string receivedBy)
    {
        if(ServiceType != ServiceType.Delivery)
            throw new InvalidOperationException("Este viaje no es un envío.");
        if(Status != TripStatus.InProgress)
            throw new InvalidOperationException("Solo se confirma la entrega con el envío en curso.");
        if(DeliveryConfirmedAt is not null)
            throw new InvalidOperationException("La entrega ya fue confirmada.");
        DeliveryReceivedBy = receivedBy;
        DeliveryConfirmedAt = DateTime.UtcNow;
    }

    public void Complete(decimal finalFare)
    {
        if(Status != TripStatus.InProgress)
            throw new InvalidOperationException("El viaje debe estar en curso para completarse.");
        if(ServiceType == ServiceType.Delivery && DeliveryConfirmedAt is null)
            throw new InvalidOperationException("Confirma la entrega (foto y quién recibió) antes de completar el envío.");
        Status = TripStatus.Completed;
        FinalFare = finalFare;
        CompletedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Programado cuyo conductor no llego: el viaje vuelve a pendiente para
    /// otros conductores (sin conductor asignado). Como ya paso la hora
    /// programada, queda como un pedido "ahora" (ScheduledAt = null).
    /// Devuelve el conductor que se quito.
    /// </summary>
    public Guid Republish(DateTime nowUtc)
    {
        if(!IsDriverLate(nowUtc))
            throw new InvalidOperationException(
                $"Solo puedes republicar si el conductor no llegó {ScheduledTrips.NoShowMinutes} minutos después de la hora programada.");
        var removed = DriverId!.Value;
        DriverId = null;
        VehicleId = null;
        ProposedFare = null;
        ProposedDriverId = null;
        AcceptedAt = null;
        DriverArrivedAt = null;
        ScheduledAt = null;
        Reminder30SentAt = null;
        Reminder10SentAt = null;
        Status = TripStatus.Pending;
        return removed;
    }

    // Programado: no se puede avisar llegada ni iniciar con demasiada anticipacion.
    private void EnsureScheduledWindow(DateTime nowUtc)
    {
        if(ScheduledAt is null) return;
        if(ScheduledAt.Value > nowUtc.AddMinutes(ScheduledTrips.EarliestStartMinutes))
            throw new InvalidOperationException(
                $"Todavía es muy pronto: este programado es para el {BugieTime.ToPeru(ScheduledAt.Value):dd/MM HH:mm}. " +
                $"Puedes empezar desde {ScheduledTrips.EarliestStartMinutes} minutos antes.");
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
