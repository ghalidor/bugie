using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Services;

/// <summary>
/// Reglas de plazo del Libro de Reclamaciones, leidas de la configuracion
/// (landing.systemsettings) y de los feriados activos (landing.holidays).
/// Si un valor falta o no es valido se usa el de por defecto.
/// </summary>
public record ComplaintPolicy(int ResponseDays, int DueSoonDays, BusinessDays Calendar)
{
    public const string ResponseDaysKey = "complaint_response_days";
    public const string DueSoonDaysKey = "complaint_due_soon_days";
    public const int DefaultResponseDays = 15;
    public const int DefaultDueSoonDays = 3;

    /// <summary>Fecha limite para una hoja registrada (o validada) ese dia.</summary>
    public DateTime DueDateFrom(DateTime today) => Calendar.Add(today, ResponseDays);

    /// <summary>Ultimo dia que cuenta como "por vencer".</summary>
    public DateTime DueSoonLimit(DateTime today) => Calendar.Add(today, DueSoonDays);

    public static async Task<ComplaintPolicy> LoadAsync(
        ISettingsRepository settings, IHolidayRepository holidays, CancellationToken ct)
    {
        var all = await settings.GetAllAsync(ct);
        var response = ReadResponseDays(all);
        var dueSoon = Math.Min(Read(all, DueSoonDaysKey, DefaultDueSoonDays, 0, 120), response);
        return new ComplaintPolicy(response, dueSoon, new BusinessDays(await holidays.GetAllAsync(ct)));
    }

    /// <summary>Plazo vigente para las hojas nuevas (tambien lo expone GET landing/company).</summary>
    public static int ReadResponseDays(IEnumerable<SystemSetting> all) =>
        Read(all, ResponseDaysKey, DefaultResponseDays, 1, 120);

    private static int Read(IEnumerable<SystemSetting> all, string key, int def, int min, int max)
    {
        var raw = all.FirstOrDefault(s => string.Equals(s.SettingKey, key, StringComparison.OrdinalIgnoreCase))?.Value;
        return int.TryParse(raw?.Trim(), out var n) && n >= min && n <= max ? n : def;
    }
}
