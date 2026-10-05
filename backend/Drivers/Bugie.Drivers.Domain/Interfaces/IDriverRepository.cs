using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Enums;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IDriverRepository
{
    Task<Driver?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Driver?> GetByUserIdAsync(Guid userId, CancellationToken ct = default);
    Task<List<Driver>> GetByStatusAsync(DriverStatus status, CancellationToken ct = default);
    Task<List<Driver>> GetOnlineAsync(CancellationToken ct = default);

    /// <summary>
    /// Lista paginada con filtros opcionales:
    /// - status: 1-6 según DriverStatus (null = todos)
    /// - online: true/false para filtrar por IsOnline, null = sin filtro
    /// - search: nombre o email/teléfono (requiere JOIN con auth, lo hacemos vía DriverWithUser)
    /// - openReview: true = solo con solicitud de revisión abierta, false = sin ella, null = sin filtro
    /// - deleted: false (defecto) = sin cuentas eliminadas (auth.Users.DeletedAt), true = solo eliminadas, null = todas
    ///   NOTA: el repo de drivers no tiene acceso directo a auth.Users. El search por nombre
    ///   se hace JOIN cross-DB (mismo SQL Server, distintos schemas).
    /// Devuelve (items, total).
    /// </summary>
    Task<(List<Driver> Items, int Total)> GetPagedAsync(
        int page, int pageSize, int? status, bool? online, string? search,
        bool? openReview = null, CancellationToken ct = default, bool? deleted = false);

    /// <summary>
    /// Lista paginada de conductores PENDIENTES de verificación.
    /// Filtra automáticamente por status 1 (PendingDocs), 2 (UnderReview)
    /// y 6 (ExpiredDocs) — los 3 que el admin debe revisar.
    /// Soporta búsqueda por nombre/email igual que GetPagedAsync.
    /// No incluye cuentas eliminadas.
    /// Devuelve (items, total).
    /// </summary>
    Task<(List<Driver> Items, int Total)> GetPendingPagedAsync(
        int page, int pageSize, string? search,
        CancellationToken ct = default);

    /// <summary>
    /// KPIs agregados de drivers. 1 sola query con 6 SUM(CASE WHEN..) condicionales.
    /// Respeta los mismos filtros para reflejar lo que el admin está viendo.
    /// </summary>
    Task<DriverStats> GetStatsAsync(int? status, bool? online, string? search,
        bool? openReview = null, CancellationToken ct = default, bool? deleted = false);

    /// <summary>
    /// Suspendidos con fecha de fin ya vencida (SuspendedUntil <= ahora).
    /// Los reactiva el job DriverSuspensionEndService.
    /// </summary>
    Task<List<Driver>> GetWithEndedSuspensionAsync(DateTime nowUtc, CancellationToken ct = default);

    /// <summary>
    /// Conductores online dentro de radiusKm ordenados por distancia.
    /// Usa índice espacial GEOGRAPHY de SQL Server.
    /// </summary>
    Task<List<NearbyDriverDto>> GetNearbyAsync(double lat, double lng,
                                                double radiusKm, int maxResults = 10,
                                                CancellationToken ct = default);

    /// <summary>
    /// Conductores aprobados por excepción cuyo plazo para completar
    /// documentos ya venció (DocumentsDeadline <= ahora).
    /// </summary>
    Task<List<Driver>> GetWithExpiredDeadlineAsync(DateTime nowUtc, CancellationToken ct = default);

    Task AddAsync(Driver driver, CancellationToken ct = default);
    Task UpdateAsync(Driver driver, CancellationToken ct = default);

    /// <summary>
    /// Vehículos activos de los conductores cuyos UserId se pasan.
    /// JOIN drivers.Drivers + drivers.Vehicles dentro de SU propia BD.
    /// Usado por Trips.Api vía HTTP para enriquecer las propuestas.
    /// </summary>
    Task<List<VehicleBulkDto>> GetVehiclesByUserIdsAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default);

    /// <summary>
    /// Marca como offline a todos los conductores que tienen IsOnline=TRUE pero
    /// cuyo último GPS (CurrentLocationAt) es más viejo que el corte dado.
    /// Devuelve la lista de UserIds de los que fueron marcados (para notificar
    /// al admin que sus pines se sacan del mapa).
    /// </summary>
    Task<List<Guid>> MarkStaleAsOfflineAsync(
        DateTime cutoffUtc, CancellationToken ct = default);
}

public record NearbyDriverDto(
    Guid DriverId,
    Guid UserId,
    double Lat,
    double Lng,
    double DistanceKm,
    decimal Rating,
    string? VehiclePlate,
    string? VehicleModel,
    string? VehicleColor
);

/// <summary>KPIs de conductores (mismos filtros que el listado paginado).</summary>
public class DriverStats
{
    public int Total { get; set; }
    public int Online { get; set; }
    public int PendingDocs { get; set; }
    public int UnderReview { get; set; }
    public int Approved { get; set; }
    public int Suspended { get; set; }
    public int Rejected { get; set; }
    public int Expired { get; set; }
    public int OpenReviewRequests { get; set; }
}

public record VehicleBulkDto(
    Guid DriverUserId,
    string Plate,
    string Brand,
    string Model,
    string Color,
    string? PhotoUrl);
