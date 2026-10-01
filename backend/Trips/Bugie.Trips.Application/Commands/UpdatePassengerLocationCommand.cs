using MediatR;

namespace Bugie.Trips.Application.Commands;

/// <summary>
/// Update de la última posición del pasajero durante su viaje activo.
/// El cliente Flutter ya hace throttle por distancia y frecuencia, así
/// que aquí no validamos nada extra: si el pasajero no tiene viaje activo,
/// el repositorio devuelve false y simplemente ignoramos.
/// </summary>
public record UpdatePassengerLocationCommand(
    Guid PassengerId, double Lat, double Lng) : IRequest<Unit>;
