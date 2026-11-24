using System.Data;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Bugie.Drivers.Domain.Common;
using Dapper;
using Npgsql;

namespace Bugie.Drivers.Infrastructure.Time;

/// <summary>
/// Configuracion de hora del servicio (ver BugieTime):
///   * columnas timestamptz y sesion de Postgres en hora de Peru (igual que la base),
///   * Dapper lee y manda las fechas en UTC (Kind = Utc),
///   * el JSON sale en hora de Peru sin zona y entra como hora de Peru si no trae zona.
/// </summary>
public static class BugieTimeSetup
{
    private static bool _dapperListo;

    /// <summary>
    /// Fija la zona de la sesion de Postgres en hora de Peru (America/Lima).
    /// Los instantes no dependen de la zona; solo como se ven en texto y el
    /// dia/hora de ::date, date_trunc, etc. (el SQL de Bugie lo pone explicito).
    /// </summary>
    public static string PeruConnectionString(string? connectionString) =>
        new NpgsqlConnectionStringBuilder(connectionString) { Timezone = BugieTime.ZoneId }.ConnectionString;

    /// <summary>Registra el handler de Dapper (una sola vez por proceso).</summary>
    public static void ConfigureDapper()
    {
        if (_dapperListo) return;
        _dapperListo = true;
        SqlMapper.RemoveTypeMap(typeof(DateTime));
        SqlMapper.RemoveTypeMap(typeof(DateTime?));
        SqlMapper.AddTypeHandler(new UtcDateTimeHandler());
    }

    /// <summary>
    /// Fechas entre Dapper y la base, siempre en UTC (Kind = Utc; Npgsql lo exige
    /// para timestamptz). Dentro del backend un DateTime sin zona que va o viene de
    /// la base es UTC (convencion desde 2026-10-02); la hora de Peru sin zona solo
    /// entra por JSON/query y se convierte antes (BugieTime.ToUtcFromInput).
    /// </summary>
    private sealed class UtcDateTimeHandler : SqlMapper.TypeHandler<DateTime>
    {
        public override DateTime Parse(object value)
        {
            var d = value is DateTime dt ? dt : Convert.ToDateTime(value, CultureInfo.InvariantCulture);
            return AsUtc(d);
        }

        public override void SetValue(IDbDataParameter parameter, DateTime value)
        {
            parameter.Value = AsUtc(value);
        }

        private static DateTime AsUtc(DateTime d) => d.Kind switch
        {
            DateTimeKind.Utc   => d,
            DateTimeKind.Local => d.ToUniversalTime(),
            _                  => DateTime.SpecifyKind(d, DateTimeKind.Utc),
        };
    }
}

/// <summary>
/// JSON de fechas:
///   * salida: UTC -> hora de Peru, sin zona ("2026-10-02T14:26:00").
///     Una fecha sin zona (ya es hora de Peru, p.ej. un dia calculado) sale tal cual.
///   * entrada: con zona se respeta; sin zona es hora de Peru. Siempre queda en UTC.
/// </summary>
public sealed class PeruDateTimeJsonConverter : JsonConverter<DateTime>
{
    private const string Format = "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF";

    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var s = reader.GetString();
        if (string.IsNullOrWhiteSpace(s)) return default;
        if (DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dto)
            && (s.EndsWith("Z", StringComparison.OrdinalIgnoreCase) || HasOffset(s)))
            return dto.UtcDateTime;
        var local = DateTime.Parse(s, CultureInfo.InvariantCulture, DateTimeStyles.None);
        return BugieTime.PeruToUtc(local);
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var peru = value.Kind switch
        {
            DateTimeKind.Utc   => BugieTime.ToPeru(value),
            DateTimeKind.Local => BugieTime.ToPeru(value.ToUniversalTime()),
            _                  => value,
        };
        writer.WriteStringValue(peru.ToString(Format, CultureInfo.InvariantCulture));
    }

    private static bool HasOffset(string s)
    {
        var t = s.IndexOf('T');
        if (t < 0) return false;
        var time = s[(t + 1)..];
        return time.Contains('+') || time.LastIndexOf('-') > 0;
    }
}
