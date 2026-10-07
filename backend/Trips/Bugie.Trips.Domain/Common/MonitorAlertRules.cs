using System.Globalization;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Domain.Common;

/// <summary>
/// Umbrales de las alertas de monitoreo que el admin configura en
/// Admin > Configuracion (landing.systemsettings). Si Landing no responde o
/// la clave no existe o no es valida se usan los valores por defecto.
/// </summary>
public static class MonitorAlertRules
{
    public const string KeyNoSignalMin   = "monitor_no_signal_min";
    public const string KeyLongStopMin   = "monitor_long_stop_min";
    public const string KeyTripDelayPct  = "monitor_trip_delay_pct";

    public const int DefaultNoSignalMin  = 3;
    public const int DefaultLongStopMin  = 5;
    public const int DefaultTripDelayPct = 50;

    /// <summary>"Detenido": se movio menos de esto (m) desde que paro.</summary>
    public const double StopRadiusM = 50;
    /// <summary>"Detenido" no aplica a menos de esto (m) del destino o de una parada.</summary>
    public const double NearDestinationM = 150;
    /// <summary>"Demorado": ademas del porcentaje, al menos estos minutos sobre lo estimado.</summary>
    public const int MinDelayMinutes = 10;
    /// <summary>Velocidad promedio urbana para estimar la duracion por distancia.</summary>
    public const double UrbanSpeedKmh = 22;

    /// <summary>Lee los valores vigentes (Landing cachea 30 s).</summary>
    public static async Task<MonitorAlertSettings> LoadAsync(ILandingClient landing, CancellationToken ct = default)
    {
        var noSignal = ParseInt(await landing.GetSettingAsync(KeyNoSignalMin, ct));
        var longStop = ParseInt(await landing.GetSettingAsync(KeyLongStopMin, ct));
        var delayPct = ParseInt(await landing.GetSettingAsync(KeyTripDelayPct, ct));

        return new MonitorAlertSettings(
            NoSignalMinutes: noSignal is > 0 ? noSignal.Value : DefaultNoSignalMin,
            LongStopMinutes: longStop is > 0 ? longStop.Value : DefaultLongStopMin,
            TripDelayPct: delayPct is >= 0 ? delayPct.Value : DefaultTripDelayPct);
    }

    private static int? ParseInt(string? v) =>
        int.TryParse(v?.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) ? i : null;
}

/// <summary>Valores vigentes de las alertas de monitoreo (ver MonitorAlertRules).</summary>
public record MonitorAlertSettings(int NoSignalMinutes, int LongStopMinutes, int TripDelayPct);
