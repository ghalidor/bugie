namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Abstracción del almacenamiento de archivos.
/// La implementación actual es Google Drive, pero al ser interfaz se puede
/// cambiar después por S3, Azure Blob, etc. sin tocar el resto del código.
/// </summary>
public interface IDriveStorageService
{
    /// <summary>Sube un archivo y devuelve la metadata del archivo creado.</summary>
    Task<StoredFile> UploadAsync(
        Stream fileStream,
        string originalFileName,
        string mimeType,
        string folderPath,
        CancellationToken ct = default);

    /// <summary>Elimina un archivo por su ID de Drive.</summary>
    Task DeleteAsync(string driveFileId, CancellationToken ct = default);

    /// <summary>Obtiene el stream para descarga directa de un archivo.</summary>
    Task<Stream> DownloadAsync(string driveFileId, CancellationToken ct = default);

    /// <summary>Obtiene los metadatos (incluido mime type) para servir el archivo.</summary>
    Task<(string MimeType, string FileName)> GetMetadataAsync(string driveFileId, CancellationToken ct = default);
}

public record StoredFile(
    string DriveFileId,
    string PreviewUrl,
    string OriginalFileName,
    string MimeType,
    long SizeBytes);