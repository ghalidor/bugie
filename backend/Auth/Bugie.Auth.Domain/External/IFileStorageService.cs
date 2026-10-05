namespace Bugie.Auth.Domain.External;

/// <summary>
/// Abstracción para subir/descargar archivos.
/// Implementación actual: local en disco. Cambiable a S3, R2, etc.
/// </summary>
public interface IFileStorageService {
    /// <summary>
    /// Guarda el archivo. Valida el tipo real (magic bytes): JPG/PNG/WEBP y PDF
    /// solo si allowPdf. El nombre en disco se genera (GUID + extensión del tipo
    /// detectado); el original no se usa. Lanza InvalidOperationException si no es válido.
    /// </summary>
    Task<StoredFile> UploadAsync(Stream fileStream, string originalFileName, string mimeType,
                                  string folderPath, CancellationToken ct = default, bool allowPdf = false);
    Task DeleteAsync(string storageFileId, CancellationToken ct = default);
    Task<Stream> DownloadAsync(string storageFileId, CancellationToken ct = default);
}

public record StoredFile(
    string StorageFileId,
    string PublicUrl,
    string OriginalFileName,
    string MimeType,
    long SizeBytes);