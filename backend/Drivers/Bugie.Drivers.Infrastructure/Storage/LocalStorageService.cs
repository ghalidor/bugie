using Bugie.Drivers.Domain.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.Storage;

/// <summary>
/// Configuración para almacenamiento local en disco.
/// </summary>
public class LocalStorageOptions
{
    /// <summary>Ruta donde se guardan los archivos. Relativa al directorio de la app o absoluta.</summary>
    public string StoragePath { get; set; } = "wwwroot/uploads";

    /// <summary>URL base pública. Ej: http://localhost:5003</summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:5003";

    /// <summary>Sub-ruta pública. Ej: /uploads → resultado: http://localhost:5003/uploads/...</summary>
    public string PublicUrlPath { get; set; } = "/uploads";
}

/// <summary>
/// Implementación de IDriveStorageService que guarda archivos en disco local.
/// Para MVP/desarrollo. Para producción migrar a Cloudflare R2 / S3 / Azure Blob.
///
/// Estructura en disco: {StoragePath}/{folderPath}/{uuid}_{nombre}.ext
/// URL pública:        {PublicBaseUrl}{PublicUrlPath}/{folderPath}/{uuid}_{nombre}.ext
/// </summary>
public class LocalStorageService : IDriveStorageService
{
    private readonly LocalStorageOptions _opt;
    private readonly ILogger<LocalStorageService> _log;
    private readonly string _rootPath;

    public LocalStorageService(
        IOptions<LocalStorageOptions> opt,
        ILogger<LocalStorageService> log)
    {
        _opt = opt.Value;
        _log = log;

        _rootPath = Path.IsPathRooted(_opt.StoragePath)
            ? _opt.StoragePath
            : Path.Combine(AppContext.BaseDirectory, _opt.StoragePath);

        Directory.CreateDirectory(_rootPath);
        _log.LogInformation("LocalStorage inicializado en: {Path}", _rootPath);
    }

    public async Task<StoredFile> UploadAsync(
        Stream fileStream, string originalFileName, string mimeType,
        string folderPath, CancellationToken ct = default)
    {
        var safeFolder = SanitizePath(folderPath);
        var folder = Path.Combine(_rootPath, safeFolder);
        Directory.CreateDirectory(folder);

        // Prefijo UUID para evitar colisiones (mismo conductor reemplazando archivos)
        var safeName = SanitizeFileName(originalFileName);
        var diskName = $"{Guid.NewGuid():N}_{safeName}";
        var fullPath = Path.Combine(folder, diskName);

        await using(var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write))
        {
            await fileStream.CopyToAsync(fs, ct);
        }

        var size = new FileInfo(fullPath).Length;
        var relativePath = Path.Combine(safeFolder, diskName).Replace('\\', '/');
        // Devolvemos URL RELATIVA en lugar de absoluta. Razón: el backend no
        // siempre sabe la URL pública correcta (localhost en appsettings vs
        // IP LAN que ve el celular). El cliente le pone el prefijo correcto
        // usando la misma base con la que habla a la API.
        // Si quieres absoluta de nuevo, usa: $"{_opt.PublicBaseUrl}{publicUrl}/{relativePath}"
        var publicUrl = $"{_opt.PublicUrlPath.TrimEnd('/')}/{relativePath}";

        _log.LogInformation("Archivo guardado: {Path}", fullPath);

        // Usamos relativePath como "DriveFileId" para poder borrar/descargar después
        return new StoredFile(
            DriveFileId: relativePath,
            PreviewUrl: publicUrl,
            OriginalFileName: originalFileName,
            MimeType: mimeType,
            SizeBytes: size);
    }

    public Task DeleteAsync(string driveFileId, CancellationToken ct = default)
    {
        var safe = SanitizePath(driveFileId);
        var fullPath = Path.Combine(_rootPath, safe);

        if(System.IO.File.Exists(fullPath))
        {
            System.IO.File.Delete(fullPath);
            _log.LogInformation("Archivo eliminado: {Path}", fullPath);
        }
        return Task.CompletedTask;
    }

    public Task<Stream> DownloadAsync(string driveFileId, CancellationToken ct = default)
    {
        var safe = SanitizePath(driveFileId);
        var fullPath = Path.Combine(_rootPath, safe);

        if(!System.IO.File.Exists(fullPath))
            throw new FileNotFoundException($"Archivo no encontrado: {driveFileId}");

        Stream stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Task.FromResult(stream);
    }

    public Task<(string MimeType, string FileName)> GetMetadataAsync(string driveFileId, CancellationToken ct = default)
    {
        var safe = SanitizePath(driveFileId);
        var fileName = Path.GetFileName(safe);
        return Task.FromResult(("application/octet-stream", fileName));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Seguridad: prevenir path traversal (..\..\, /etc/passwd, etc.)
    // ─────────────────────────────────────────────────────────────────────
    private static string SanitizePath(string path)
    {
        if(string.IsNullOrWhiteSpace(path)) return string.Empty;
        return path
            .Replace("..", "")
            .Replace('\\', '/')
            .TrimStart('/');
    }

    private static string SanitizeFileName(string name)
    {
        if(string.IsNullOrWhiteSpace(name)) return "archivo";
        var invalid = Path.GetInvalidFileNameChars();
        var clean = string.Concat(name.Where(c => !invalid.Contains(c) && c != ' '));
        return string.IsNullOrEmpty(clean) ? "archivo" : clean;
    }
}