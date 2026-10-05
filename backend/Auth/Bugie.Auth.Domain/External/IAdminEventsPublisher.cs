namespace Bugie.Auth.Domain.External;

/// <summary>
/// Envía un aviso al Centro de avisos del panel admin (vía Trips.Api,
/// POST /api/internal/admin-events → SignalR "admin:event").
/// Fire-and-forget: nunca lanza excepción ni bloquea la petición actual.
/// </summary>
public interface IAdminEventsPublisher
{
    /// <param name="type">contact_message, complaint, driver_review, passenger_review, document_expiring...</param>
    /// <param name="link">Ruta del panel a la que lleva el aviso (ej. /admin/verificacion).</param>
    /// <param name="permission">Permiso que debe tener el admin para verlo (ej. view:drivers).</param>
    void Publish(string type, string title, string message, string link, string permission);
}
