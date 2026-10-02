namespace Bugie.Drivers.Domain.Common;

/// <summary>
/// Hora oficial de Bugie: la del servidor, Peru (America/Lima, UTC-5 sin horario de verano).
///
/// Regla de todo el sistema:
///   * La base guarda en UTC (la conexion fuerza Timezone=UTC).
///   * El backend trabaja en UTC (DateTime.UtcNow).
///   * Las APIs devuelven SIEMPRE hora de Peru y sin zona, asi cualquier
///     pantalla (web, admin, app) muestra la misma hora sin importar la zona
///     del celular o navegador. Una fecha recibida sin zona se toma como hora de Peru.
/// </summary>
public static class BugieTime
{
    public const string ZoneId = "America/Lima";

    private static readonly TimeZoneInfo Zone = FindZone();

    private static TimeZoneInfo FindZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(ZoneId); }
        catch { return TimeZoneInfo.FindSystemTimeZoneById("SA Pacific Standard Time"); }
    }

    /// <summary>Hora actual de Peru (Kind = Unspecified).</summary>
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zone);

    /// <summary>Fecha de hoy en Peru.</summary>
    public static DateTime Today => Now.Date;

    /// <summary>UTC -> hora de Peru (Kind = Unspecified).</summary>
    public static DateTime ToPeru(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone);

    /// <summary>Hora de Peru -> UTC (Kind = Utc).</summary>
    public static DateTime PeruToUtc(DateTime peru) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(peru, DateTimeKind.Unspecified), Zone);

    /// <summary>
    /// Normaliza una fecha recibida de afuera (JSON, formulario, query) a UTC:
    /// con zona se respeta; sin zona se entiende como hora de Peru.
    /// </summary>
    public static DateTime ToUtcFromInput(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc   => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _                  => PeruToUtc(value),
    };
}
