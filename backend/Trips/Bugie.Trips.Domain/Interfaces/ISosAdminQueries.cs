namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Consultas de solo lectura del Centro SOS del admin: alertas con los datos de
/// quien activó, del otro participante del viaje y de quien resolvió.
/// Los nombres y teléfonos salen de auth.Users (misma base).
/// </summary>
public interface ISosAdminQueries
{
    /// <summary>Alertas activas (no resueltas), la más antigua primero.</summary>
    Task<List<SosAdminRow>> GetActiveAsync(CancellationToken ct = default);

    /// <summary>
    /// Historial de alertas resueltas, la más reciente primero.
    /// fromUtc / toUtc: rango de CreatedAt en UTC (toUtc excluyente).
    /// search: nombre o celular del pasajero o del conductor, o motivo.
    /// </summary>
    Task<(List<SosAdminRow> Items, int Total)> GetHistoryAsync(
        int page, int pageSize, DateTime? fromUtc, DateTime? toUtc, string? search,
        CancellationToken ct = default);
}

/// <summary>Una alerta SOS con los datos de las personas del viaje.</summary>
public class SosAdminRow
{
    public Guid Id { get; set; }
    public Guid TripId { get; set; }
    /// <summary>Quien activó la alerta y su rol ('passenger' o 'driver').</summary>
    public Guid UserId { get; set; }
    public string UserRole { get; set; } = string.Empty;
    public double Lat { get; set; }
    public double Lng { get; set; }
    public bool Resolved { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionReason { get; set; }
    public Guid? ResolvedBy { get; set; }
    public string? ResolvedByName { get; set; }
    /// <summary>Minutos entre la activación y la resolución (null si sigue activa).</summary>
    public double? DurationMinutes { get; set; }

    public string? UserName { get; set; }
    public string? UserPhone { get; set; }

    // Participantes del viaje (UserIds) con nombre y celular.
    public Guid PassengerId { get; set; }
    public string? PassengerName { get; set; }
    public string? PassengerPhone { get; set; }
    public Guid? DriverId { get; set; }
    public string? DriverName { get; set; }
    public string? DriverPhone { get; set; }

    public string? OriginAddress { get; set; }
    public string? DestAddress { get; set; }
}
