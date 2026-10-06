using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>Un archivo del historial frio (un dia UTC de GPS crudo).</summary>
public record GpsArchiveFileInfo(string FileName, DateOnly? Day, long SizeBytes, DateTime ModifiedAtUtc);

/// <summary>Escritura por bloques de un archivo del dia. Se cierra con CompleteAsync (o se descarta al Dispose).</summary>
public interface IGpsArchiveWriter : IAsyncDisposable
{
    Task WriteChunkAsync(IReadOnlyList<GpsRawPoint> rows, CancellationToken ct = default);

    /// <summary>Cierra el archivo y lo deja en su ruta definitiva. Devuelve la ruta.</summary>
    Task<string> CompleteAsync(CancellationToken ct = default);
}

/// <summary>
/// Historial frio del GPS crudo: un archivo Parquet por dia (UTC) en la
/// carpeta GpsArchive:Folder, locationhistory_YYYY-MM-DD.parquet.
/// </summary>
public interface IGpsArchiveStore
{
    string FolderPath { get; }

    string FilePathFor(DateOnly day);

    Task<IGpsArchiveWriter> CreateWriterAsync(DateOnly day, CancellationToken ct = default);

    /// <summary>Filas que tiene el archivo (para verificar antes de borrar la particion).</summary>
    Task<long> CountRowsAsync(string filePath, CancellationToken ct = default);

    /// <summary>Puntos de un viaje dentro del archivo de un dia. Lista vacia si el archivo no existe.</summary>
    Task<List<GpsRawPoint>> ReadTripAsync(DateOnly day, Guid tripId, CancellationToken ct = default);

    List<GpsArchiveFileInfo> ListFiles();
}
