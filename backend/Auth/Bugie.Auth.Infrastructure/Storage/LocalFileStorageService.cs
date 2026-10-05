using Bugie.Auth.Domain.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Auth.Infrastructure.Storage;

public class LocalStorageOptions
{
    public string StoragePath { get; set; } = "wwwroot/uploads";
    public string PublicBaseUrl { get; set; } = "http://localhost:5001";
    public string PublicUrlPath { get; set; } = "/uploads";
}

public class LocalFileStorageService : IFileStorageService
{
    private readonly LocalStorageOptions _opt;
    private readonly ILogger<LocalFileStorageService> _log;
    private readonly string _rootPath;

    public LocalFileStorageService(IOptions<LocalStorageOptions> opt, ILogger<LocalFileStorageService> log)
    {
        _opt = opt.Value;
        _log = log;

        _rootPath = Path.IsPathRooted(_opt.StoragePath)
            ? _opt.StoragePath
            : Path.Combine(AppContext.BaseDirectory, _opt.StoragePath);

        Directory.CreateDirectory(_rootPath);
        _log.LogInformation("LocalFileStorage (Auth) inicializado en: {Path}", _rootPath);
    }

    public async Task<StoredFile> UploadAsync(Stream fileStream, string originalFileName, string mimeType,
                                               string folderPath, CancellationToken ct = default, bool allowPdf = false)
    {
        // Tipo real por magic bytes (no se confía en el nombre ni en el Content-Type).
        fileStream = await FileSignature.EnsureSeekableAsync(fileStream, ct);
        var kind = FileSignature.Detect(fileStream);
        if(!FileSignature.IsAllowed(kind, allowPdf))
            throw new InvalidOperationException(FileSignature.RejectMessage(allowPdf));
        mimeType = kind!.MimeType;

        var safeFolder = Sanitize(folderPath);
        var folder = Path.Combine(_rootPath, safeFolder);
        Directory.CreateDirectory(folder);

        // Nombre en disco generado: no se usa el nombre original.
        var diskName = $"{Guid.NewGuid():N}{kind.Extension}";
        var fullPath = Path.Combine(folder, diskName);

        await using(var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write))
        {
            await fileStream.CopyToAsync(fs, ct);
        }

        var size = new FileInfo(fullPath).Length;
        var relativePath = Path.Combine(safeFolder, diskName).Replace('\\', '/');
        // URL RELATIVA: igual que en Drivers. El cliente le pone el host correcto
        // usando ApiConfig.resolveMediaUrl. Esto evita el bug de "localhost"
        // que no funciona cuando el celular se conecta por IP LAN.
        var publicUrl = $"{_opt.PublicUrlPath.TrimEnd('/')}/{relativePath}";

        _log.LogInformation("Archivo guardado: {Path}", fullPath);

        return new StoredFile(
            StorageFileId: relativePath,
            PublicUrl: publicUrl,
            OriginalFileName: originalFileName,
            MimeType: mimeType,
            SizeBytes: size);
    }

    public Task DeleteAsync(string storageFileId, CancellationToken ct = default)
    {
        var safe = Sanitize(storageFileId);
        var fullPath = Path.Combine(_rootPath, safe);
        if(System.IO.File.Exists(fullPath))
        {
            System.IO.File.Delete(fullPath);
            _log.LogInformation("Archivo eliminado: {Path}", fullPath);
        }
        return Task.CompletedTask;
    }

    public Task<Stream> DownloadAsync(string storageFileId, CancellationToken ct = default)
    {
        var safe = Sanitize(storageFileId);
        var fullPath = Path.Combine(_rootPath, safe);
        if(!System.IO.File.Exists(fullPath))
            throw new FileNotFoundException($"Archivo no encontrado: {storageFileId}");
        Stream s = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Task.FromResult(s);
    }

    private static string Sanitize(string p) =>
        string.IsNullOrWhiteSpace(p) ? "" : p.Replace("..", "").Replace('\\', '/').TrimStart('/');

    private static string SanitizeFileName(string name)
    {
        if(string.IsNullOrWhiteSpace(name)) return "archivo";
        var invalid = Path.GetInvalidFileNameChars();
        var clean = string.Concat(name.Where(c => !invalid.Contains(c) && c != ' '));
        return string.IsNullOrEmpty(clean) ? "archivo" : clean;
    }
}