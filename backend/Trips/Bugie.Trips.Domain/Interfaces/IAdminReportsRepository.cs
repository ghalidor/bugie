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
