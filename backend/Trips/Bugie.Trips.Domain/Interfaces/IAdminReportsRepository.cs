using Bugie.Trips.Domain.Common;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Repositorio para reportes administrativos del módulo Trips.
/// Las consultas hacen JOIN cross-schema (drivers, auth, payments) porque
/// la BD es única; eso lo mantenemos confinado a la capa Infrastructure.
/// </summary>
public interface IAdminReportsRepository
{
    /// <summary>
    /// Cuenta cuántos conductores distintos recibieron al menos UNA
    /// calificación en el rango de fechas [from, to) (to exclusivo).
    /// Se usa para paginación.
    /// </summary>
    Task<int> CountDriversRatedInRangeAsync(
        DateTime from, DateTime to, CancellationToken ct = default);

    /// <summary>
    /// Devuelve una página del ranking de conductores en el rango [from, to).
    /// Ordenado por promedio de estrellas DESC, desempate por cantidad DESC.
    /// </summary>
    Task<IReadOnlyList<DriverRankingRow>> GetDriverRankingPagedAsync(
        DateTime from, DateTime to, int skip, int take, CancellationToken ct = default);

    /// <summary>
    /// Ranking completo de cada mes (hora de Peru) dentro de [from, to): una fila
    /// por conductor y mes con su puesto. Mismo orden que el ranking mensual.
    /// </summary>
    Task<IReadOnlyList<MonthlyRankingRow>> GetMonthlyRankingAsync(
        DateTime from, DateTime to, CancellationToken ct = default);

    /// <summary>
    /// Resumen de gestion del periodo: viajes, SOS, alertas de seguridad,
    /// serie diaria (todos los dias del rango) y viajes completados por hora (Peru).
    /// sosGoalMin: meta de respuesta SOS en minutos (ver SosResponseGoal.LoadAsync).
    /// </summary>
    Task<TripsSummaryData> GetTripsSummaryAsync(ReportPeriod period, double sosGoalMin, CancellationToken ct = default);
}

/// <summary>Datos crudos del resumen de gestion (ver GetTripsSummaryAsync).</summary>
public sealed class TripsSummaryData
{
    public TripsTotalsRow Totals { get; set; } = new();
    public SosSummaryRow Sos { get; set; } = new();
    public SafetySummaryRow Safety { get; set; } = new();
    public List<TripsDailyRow> Daily { get; set; } = new();
    public List<TripsHourlyRow> Hourly { get; set; } = new();
}

/// <summary>Totales de viajes del periodo (montos de los completados).</summary>
public sealed class TripsTotalsRow
{
    public int Created { get; set; }
    public int Completed { get; set; }
    public int Cancelled { get; set; }
    public int InProgressNow { get; set; }
    public int CompletedRides { get; set; }
    public int CompletedDeliveries { get; set; }
    public int CancelledByPassenger { get; set; }
    public int CancelledByDriver { get; set; }
    public int CancelledByAdmin { get; set; }
    public int CancelledBySystem { get; set; }
    public decimal? CancellationRate { get; set; }
    public decimal TotalFares { get; set; }
    public decimal? AvgFare { get; set; }
    public decimal TotalDiscounts { get; set; }
    public decimal? AvgDistanceKm { get; set; }
    public decimal? AvgTripMin { get; set; }
    public decimal? AvgPickupMin { get; set; }
    public int ActivePassengers { get; set; }
    public int ActiveDrivers { get; set; }
}

/// <summary>Alertas SOS creadas en el periodo y sus tiempos de resolucion y de respuesta (minutos).</summary>
public sealed class SosSummaryRow
{
    public int Total { get; set; }
    public int Resolved { get; set; }
    public int Open { get; set; }
    /// <summary>Meta de respuesta usada en los porcentajes (Configuracion: sos_response_min).</summary>
    public double GoalMin { get; set; }
    public decimal? AvgResolveMin { get; set; }
    public decimal? MedianResolveMin { get; set; }
    public decimal? MaxResolveMin { get; set; }
    /// <summary>% de las resueltas en menos de la meta (GoalMin; nombre historico).</summary>
    public decimal? ResolvedUnder2MinPct { get; set; }

    // Tiempo de RESPUESTA (lo primero entre visto y atendiendo; si se resolvio
    // sin ninguna marca, hasta la resolucion). Ver ISosAdminQueries.
    public decimal? AvgResponseMin { get; set; }
    public decimal? MedianResponseMin { get; set; }
    /// <summary>% de las alertas con respuesta que se respondieron en menos de la meta (GoalMin; nombre historico).</summary>
    public decimal? RespondedUnder2MinPct { get; set; }
    /// <summary>Resueltas sin registrar visto ni atendiendo ("atencion no registrada").</summary>
    public int UnregisteredCount { get; set; }
}

/// <summary>Desvios de ruta y alertas del monitor iniciados en el periodo.</summary>
public sealed class SafetySummaryRow
{
    public int Deviations { get; set; }
    public int AlertsNoSignal { get; set; }
    public int AlertsLongStop { get; set; }
    public int AlertsDelayed { get; set; }
}

/// <summary>Un dia de Peru (YYYY-MM-DD) del periodo.</summary>
public sealed class TripsDailyRow
{
    public string Date { get; set; } = "";
    public int Created { get; set; }
    public int Completed { get; set; }
    public int Cancelled { get; set; }
    public decimal Fares { get; set; }
}

/// <summary>Viajes completados por hora de Peru (0..23).</summary>
public sealed class TripsHourlyRow
{
    public int Hour { get; set; }
    public int Completed { get; set; }
}

/// <summary>Puesto de un conductor en un mes.</summary>
public record MonthlyRankingRow(
    Guid DriverUserId,
    string FullName,
    string? PhotoUrl,
    int Year,
    int Month,
    decimal AvgStars,
    int RatingCount,
    int Place);

/// <summary>
/// Fila plana devuelta por el repo. Usamos un record para que sea inmutable.
/// La capa Application la mapea al DTO público.
/// </summary>
public record DriverRankingRow(
    Guid DriverUserId,
    string FullName,
    string? Email,
    string? Phone,
    string? PhotoUrl,
    decimal AvgStars,
    int RatingCount,
    int TripsCompletedInMonth,
    decimal EarningsInMonth);
