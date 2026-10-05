namespace Bugie.Drivers.Domain.Common;

/// <summary>
/// Umbrales (días antes del vencimiento) en los que se avisa de un documento
/// por vencer. Se configuran en landing.SystemSettings, clave
/// doc_expiry_alert_days (ej. "6,3,0"). Si falta o es inválida: 6, 3 y 0.
/// </summary>
public static class DocExpiryAlertDays
{
    public const string SettingKey = "doc_expiry_alert_days";

    public static readonly IReadOnlyList<int> Default = new[] { 6, 3, 0 };

    /// <summary>Convierte "6,3,0" en [6, 3, 0] (sin repetidos, de mayor a menor).</summary>
    public static IReadOnlyList<int> Parse(string? value)
    {
        if(string.IsNullOrWhiteSpace(value)) return Default;
        var days = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var n) ? n : -1)
            .Where(n => n >= 0 && n <= 365)
            .Distinct()
            .OrderByDescending(n => n)
            .ToList();
        return days.Count == 0 ? Default : days;
    }
}
