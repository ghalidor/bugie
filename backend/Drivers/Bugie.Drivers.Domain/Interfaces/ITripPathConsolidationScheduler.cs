namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>
/// Programa la consolidacion del recorrido de un viaje (drivers.trippaths) unos
/// segundos despues de que Trips avisa que termino, para que alcancen a entrar
/// los ultimos puntos GPS. Si falla, el job nocturno lo consolida igual.
/// </summary>
public interface ITripPathConsolidationScheduler
{
    void Schedule(Guid tripId);
}
