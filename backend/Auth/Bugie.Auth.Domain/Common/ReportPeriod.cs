using System.Globalization;

namespace Bugie.Auth.Domain.Common;

/// <summary>
/// Periodo de un reporte en dias de Peru, ambos inclusive.
/// Columnas timestamptz: el rango es [From 00:00 Peru, To+1 00:00 Peru) como instantes UTC.
/// </summary>
public sealed record ReportPeriod(DateOnly From, DateOnly To)
{
    public const int MaxDays     = 366;
    public const int DefaultDays = 30;

    /// <summary>Inicio del primer dia (00:00 de Peru) en UTC.</summary>
    public DateTime FromUtc => BugieTime.PeruToUtc(From.ToDateTime(TimeOnly.MinValue));

    /// <summary>Inicio del dia siguiente al ultimo (exclusivo) en UTC.</summary>
    public DateTime ToUtc => BugieTime.PeruToUtc(To.AddDays(1).ToDateTime(TimeOnly.MinValue));

    /// <summary>Primer y ultimo dia como texto yyyy-MM-dd (para generate_series y la respuesta).</summary>
    public string FromText => From.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public string ToText   => To.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>
    /// Arma el periodo desde el query (YYYY-MM-DD). Sin fechas: ultimos 30 dias hasta hoy (Peru).
    /// Devuelve null y el mensaje de error si las fechas no son validas.
    /// </summary>
    public static ReportPeriod? TryCreate(string? from, string? to, out string? error)
    {
        error = null;
        var hoy = DateOnly.FromDateTime(BugieTime.Today);

        if (!TryParse(to, out var hasta)) { error = "La fecha final no es válida (formato AAAA-MM-DD)."; return null; }
        if (!TryParse(from, out var desde)) { error = "La fecha de inicio no es válida (formato AAAA-MM-DD)."; return null; }

        var fin    = hasta ?? hoy;
        var inicio = desde ?? fin.AddDays(-(DefaultDays - 1));

        if (inicio > fin) { error = "La fecha de inicio no puede ser posterior a la fecha final."; return null; }
        if (fin.DayNumber - inicio.DayNumber + 1 > MaxDays)
        {
            error = $"El rango no puede superar {MaxDays} días.";
            return null;
        }
        return new ReportPeriod(inicio, fin);
    }

    /// <summary>Vacio = null (se usa el valor por defecto). Texto invalido = false.</summary>
    private static bool TryParse(string? value, out DateOnly? date)
    {
        date = null;
        if (string.IsNullOrWhiteSpace(value)) return true;
        if (!DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var d)) return false;
        date = d;
        return true;
    }
}
