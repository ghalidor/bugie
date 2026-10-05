namespace Bugie.Landing.Domain.Interfaces;

/// <summary>
/// Guarda archivos en la carpeta compartida de subidas (LocalStorage:StoragePath).
/// Devuelve la URL RELATIVA publica (/uploads/...), igual que Auth/Drivers/Trips.
/// </summary>
public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, string originalFileName, string folder, CancellationToken ct = default);

    /// <summary>Convierte una URL relativa (/uploads/...) en absoluta (para correos).</summary>
    string ToAbsoluteUrl(string? relativeUrl);
}
