using System.Globalization;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Centro SOS del admin: consultas de alertas con los datos de quien activó,
/// del otro participante del viaje y de quien resolvió, las marcas de atención
/// ("visto" y "atendiendo") y la auditoría de tiempos de respuesta.
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

    /// <summary>Una alerta por Id (activa o resuelta). Null si no existe.</summary>
    Task<SosAdminRow?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// "Visto": un admin abrió la alerta. Marca (solo la primera vez, hora now())
    /// TODAS las alertas activas del mismo viaje que aún no tenían visto, como
    /// al resolver. Las resueltas no se tocan. Devuelve cuántas se marcaron.
    /// </summary>
    Task<int> MarkSeenAsync(Guid alertId, Guid adminId, CancellationToken ct = default);

    /// <summary>
    /// "Atendiendo": un admin tomó la alerta. Marca (solo la primera vez) las
    /// alertas activas del mismo viaje sin atendiendo; si alguna no tenía visto,
    /// también queda vista por ese admin a la misma hora. Devuelve cuántas se marcaron.
    /// </summary>
    Task<int> MarkAttendingAsync(Guid alertId, Guid adminId, CancellationToken ct = default);

    /// <summary>
    /// Auditoría de alertas creadas en el periodo (días de Perú): resumen de
    /// tiempos y una página de alertas, la más reciente primero.
    /// goalMin: meta de respuesta en minutos (ver SosResponseGoal.LoadAsync).
    /// </summary>
    Task<SosAuditData> GetAuditAsync(ReportPeriod period, double goalMin, int page, int pageSize,
                                     CancellationToken ct = default);
}

/// <summary>
/// Meta de tiempo de respuesta a un SOS. Sale del parámetro `sos_response_min`
/// (Admin > Configuración, landing.systemsettings), el mismo que usa el Centro SOS.
/// Si Landing no responde o el valor no es válido (&lt;= 0) se usa el respaldo
/// del acta del proyecto (menos de 2 minutos).
/// </summary>
public static class SosResponseGoal
{
    public const string Key = "sos_response_min";
    public const double FallbackMinutes = 2;

    /// <summary>Lee la meta vigente en minutos (Landing cachea 30 s).</summary>
    public static async Task<double> LoadAsync(ILandingClient landing, CancellationToken ct = default)
    {
        var raw = await landing.GetSettingAsync(Key, ct);
        return double.TryParse(raw?.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
               && v > 0 && double.IsFinite(v)
            ? v
            : FallbackMinutes;
    }

    /// <summary>Respuesta en menos de la meta (null si aún no hay respuesta).</summary>
    public static bool? Meets(double? responseMinutes, double goalMin) =>
        responseMinutes is null ? null : responseMinutes < goalMin;
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

    /// <summary>Primera vez que un admin abrió la alerta (null si nadie).</summary>
    public DateTime? FirstSeenAt { get; set; }
    public Guid? FirstSeenBy { get; set; }
    public string? FirstSeenByName { get; set; }
    /// <summary>Primer admin que presionó "Atendiendo" (null si nadie).</summary>
    public DateTime? AttendingAt { get; set; }
    public Guid? AttendingBy { get; set; }
    public string? AttendingByName { get; set; }
    /// <summary>
    /// Minutos de respuesta: lo primero entre visto y atendiendo, menos la
    /// activación. Si se resolvió sin ninguna marca, hasta la resolución.
    /// Null si sigue activa y nadie la vio.
    /// </summary>
    public double? ResponseMinutes { get; set; }
    /// <summary>Se resolvió sin registrar visto ni atendiendo (la respuesta es la resolución).</summary>
    public bool AttentionUnregistered { get; set; }
    /// <summary>
    /// Respuesta en menos de la meta (null si aún no hay respuesta). Solo se llena
    /// en la auditoría (GetAuditAsync), que recibe la meta vigente.
    /// </summary>
    public bool? MeetsGoal { get; set; }

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

/// <summary>Auditoría SOS del periodo: resumen y una página de alertas.</summary>
public sealed class SosAuditData
{
    public SosAuditSummaryRow Summary { get; set; } = new();
    public List<SosAdminRow> Items { get; set; } = new();
    public int Total { get; set; }
}

/// <summary>Resumen de tiempos de las alertas creadas en el periodo (minutos).</summary>
public sealed class SosAuditSummaryRow
{
    public int Total { get; set; }
    public int Resolved { get; set; }
    public int Open { get; set; }
    /// <summary>Alertas con tiempo de respuesta (vistas, atendidas o resueltas).</summary>
    public int Responded { get; set; }
    /// <summary>Activas que nadie vio ni atendió todavía.</summary>
    public int Pending { get; set; }
    public decimal? AvgResponseMin { get; set; }
    public decimal? MedianResponseMin { get; set; }
    public decimal? MaxResponseMin { get; set; }
    /// <summary>% de las respondidas en menos de la meta (nombre histórico: "Under2Min").</summary>
    public decimal? RespondedUnder2MinPct { get; set; }
    /// <summary>Resueltas sin registrar visto ni atendiendo.</summary>
    public int UnregisteredCount { get; set; }
    public decimal? AvgResolveMin { get; set; }
}
