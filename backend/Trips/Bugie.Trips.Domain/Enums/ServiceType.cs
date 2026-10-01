namespace Bugie.Trips.Domain.Enums;

/// <summary>
/// Tipo de servicio de una solicitud.
/// Ride    = viaje de pasajeros (comportamiento original).
/// Delivery = envío: recoger paquete(s) del cliente y llevarlos al destino.
/// </summary>
public enum ServiceType
{
    Ride = 0,
    Delivery = 1
}
