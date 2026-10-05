namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Aviso guardado en la bandeja del usuario (tabla trips.usernotifications).
/// Una fila por cada push visible que se le envio, tenga o no tokens FCM.
/// Fechas en UTC (el JSON las devuelve en hora de Peru).
/// </summary>
public class UserNotification
{
    public Guid      Id        { get; set; }
    public Guid      UserId    { get; set; }
    public string    Title     { get; set; } = "";
    public string    Body      { get; set; } = "";
    /// <summary>data["type"] del push (ej. trip_cancelled, payout). Puede ser null.</summary>
    public string?   Type      { get; set; }
    /// <summary>data["alert_type"] del push (trip, proposal, accepted, sos...).</summary>
    public string?   AlertType { get; set; }
    /// <summary>Pantalla a la que navega la app al tocarlo.</summary>
    public string?   Route     { get; set; }
    /// <summary>Resto de claves de data, como JSON {"clave":"valor"}.</summary>
    public string?   Data      { get; set; }
    public DateTime  CreatedAt { get; set; }
    /// <summary>NULL = no leida.</summary>
    public DateTime? ReadAt    { get; set; }
}
