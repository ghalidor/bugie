using Bugie.Auth.Domain.Common;

namespace Bugie.Auth.Domain.Interfaces;

/// <summary>Reportes administrativos de usuarios (solo lectura). Sin admins.</summary>
public interface IAdminReportsRepository
{
    /// <summary>Registros de pasajeros y conductores del periodo, totales actuales y serie diaria.</summary>
    Task<UsersReportData> GetUsersReportAsync(ReportPeriod period, CancellationToken ct = default);
}

/// <summary>Datos crudos del reporte (ver GetUsersReportAsync).</summary>
public sealed class UsersReportData
{
    public UsersReportCountsRow Counts { get; set; } = new();
    public List<UsersDailyRow> Daily { get; set; } = new();
}

/// <summary>
/// NewPassengers/NewDrivers: cuentas creadas en el periodo.
/// Passengers/Drivers: cuentas no eliminadas hoy. ActiveUsers: activas y no eliminadas.
/// </summary>
public sealed class UsersReportCountsRow
{
    public int NewPassengers { get; set; }
    public int NewDrivers { get; set; }
    public int Passengers { get; set; }
    public int Drivers { get; set; }
    public int ActiveUsers { get; set; }
}

/// <summary>Un dia de Peru (YYYY-MM-DD) del periodo.</summary>
public sealed class UsersDailyRow
{
    public string Date { get; set; } = "";
    public int Passengers { get; set; }
    public int Drivers { get; set; }
}
