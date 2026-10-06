using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>Una particion diaria (UTC) de drivers.locationhistory.</summary>
public record GpsPartitionInfo(string Name, DateOnly Day);

/// <summary>
/// Operaciones sobre las particiones de drivers.locationhistory para el
/// archivo historico (job GpsArchive). La ingesta de GPS no pasa por aqui.
/// </summary>
public interface IGpsArchiveRepository
{
    /// <summary>Crea las particiones de hoy (UTC) + N dias. Devuelve cuantas creo.</summary>
    Task<int> EnsurePartitionsAsync(int daysAhead, CancellationToken ct = default);

    /// <summary>Particiones por dia existentes (sin la DEFAULT), de la mas antigua a la mas nueva.</summary>
    Task<List<GpsPartitionInfo>> GetDayPartitionsAsync(CancellationToken ct = default);

    Task<long> CountRowsAsync(string partitionName, CancellationToken ct = default);

    /// <summary>Lee filas de la particion ordenadas por id, de a bloques (id &gt; afterId).</summary>
    Task<List<GpsRawPoint>> ReadRowsAsync(string partitionName, long afterId, int limit, CancellationToken ct = default);

    /// <summary>Viajes con puntos en la particion que no tienen fila en drivers.trippaths.</summary>
    Task<List<Guid>> GetTripIdsWithoutPathAsync(string partitionName, CancellationToken ct = default);

    Task DropPartitionAsync(string partitionName, CancellationToken ct = default);

    /// <summary>Filas en la particion DEFAULT (deberia ser 0; si no, falto crear una particion).</summary>
    Task<long> CountDefaultRowsAsync(CancellationToken ct = default);
}
