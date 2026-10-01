namespace Bugie.Trips.Domain.Enums;

/// <summary>
/// Clasifica las fotos asociadas a un envío.
/// RequestPackage  = fotos del paquete que sube el CLIENTE al solicitar el envío.
/// PickupMain      = foto principal del paquete con el cliente, al recoger (conductor).
/// PickupSecondary = fotos secundarias del paquete al recoger (conductor), pueden ser varias.
/// </summary>
public enum TripPhotoKind
{
    RequestPackage = 0,
    PickupMain = 1,
    PickupSecondary = 2
}
