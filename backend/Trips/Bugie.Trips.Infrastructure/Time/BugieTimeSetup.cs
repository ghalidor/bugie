using System.Data;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Bugie.Trips.Domain.Common;
using Dapper;
using Npgsql;

namespace Bugie.Trips.Infrastructure.Time;

/// <summary>
/// Configuracion de hora del servicio (ver BugieTime):
///   * conexion a Postgres en UTC,
///   * Dapper lee las fechas como UTC,
///   * el JSON sale en hora de Peru sin zona y entra como hora de Peru si no trae zona.
/// </summary>
public static class BugieTimeSetup
{
    private static bool _dapperListo;

    /// <summary>Fuerza la zona UTC en la sesion de Postgres.</summary>
    public static string UtcConnectionString(string? connectionString) =>
        new NpgsqlConnectionStringBuilder(connectionString) { Timezone = "UTC" }.ConnectionString;

    /// <summary>Registra el handler de Dapper (una sola vez por proceso).</summary>
    public static void ConfigureDapper()
    {
        if (_dapperListo) return;
        _dapperListo = true;
        SqlMapper.RemoveTypeMap(typeof(DateTime));
        SqlMapper.RemoveTypeMap(typeof(DateTime?));
        SqlMapper.AddTypeHandler(new UtcDateTimeHandler());
    }

    /// <summary>Lo que viene de la base es UTC: se marca asi.</summary>
    private sealed class UtcDateTimeHandler : SqlMapper.TypeHandler<DateTime>
    {
        public override DateTime Parse(object value)
        {
            var d = value is DateTime dt ? dt : Convert.ToDateTime(value, CultureInfo.InvariantCulture);
            return d.Kind == DateTimeKind.Utc ? d : DateTime.SpecifyKind(d.Kind == DateTimeKind.Local ? d.ToUniversalTime() : d, DateTimeKind.Utc);
        }

        public override void SetValue(IDbDataParameter parameter, DateTime value)
        {
            // Se manda tal cual: Utc -> timestamptz (sesion UTC), Unspecified -> timestamp.
            parameter.Value = value;
        }
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
