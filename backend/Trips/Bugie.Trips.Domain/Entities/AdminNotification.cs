namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Aviso en vivo enviado a los admins (tabla trips.adminnotifications).
/// Una fila por cada "admin:event" y cada "deviation:new" que Trips empuja
/// por SignalR. Fechas en UTC (el JSON las devuelve en hora de Peru).
/// </summary>
public class AdminNotification
{
    public Guid      Id         { get; set; }
    /// <summary>deviation, sos, contact_message, complaint, driver_review, passenger_review...</summary>
    public string    Type       { get; set; } = "";
    public string    Title      { get; set; } = "";
    public string    Message    { get; set; } = "";
    /// <summary>Ruta del panel a la que lleva el aviso (ej. /admin/monitoreo).</summary>
    public string?   Link       { get; set; }
    /// <summary>Permiso necesario para verlo (ej. view:messages); varios separados por coma = basta uno. NULL = todos los admins.</summary>
    public string?   Permission { get; set; }
    /// <summary>Datos extra como JSON (ej. {"tripId":"..."}).</summary>
    public string?   Data       { get; set; }
    public DateTime  CreatedAt  { get; set; }
    /// <summary>
    /// Cuando lo leyo el admin que consulta (trips.adminnotificationreads).
    /// NULL = no leido. No es columna de la tabla.
    /// </summary>
    public DateTime? ReadAt     { get; set; }
}
