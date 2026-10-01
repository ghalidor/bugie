namespace Bugie.Trips.Domain.External;

/// <summary>
/// Abstraccion para subir/descargar archivos (fotos de envios).
/// Implementacion actual: local en disco. Cambiable a S3/R2/etc.
/// Mismo contrato que Auth/Drivers para mantener consistencia.
/// </summary>
public interface IFileStorageService
{
    Task<StoredFile> UploadAsync(Stream fileStream, string originalFileName, string mimeType,
                                 string folderPath, CancellationToken ct = default);
    Task DeleteAsync(string storageFileId, CancellationToken ct = default);
    Task<Stream> DownloadAsync(string storageFileId, CancellationToken ct = default);
}

public record StoredFile(
    string StorageFileId,
    string PublicUrl,
    string OriginalFileName,
    string MimeType,
    long SizeBytes);
