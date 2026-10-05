namespace Bugie.Landing.Domain.Interfaces;

/// <summary>
/// Avisa al centro de avisos del admin (Trips: POST /api/internal/admin-events).
/// Es "dispara y olvida": nunca lanza excepciones ni bloquea la peticion.
/// </summary>
public interface IAdminEventsPublisher
{
    void Publish(string type, string title, string message, string link, string permission);
}
