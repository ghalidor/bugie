using Bugie.Trips.Domain.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Trips.Infrastructure.Storage;

public class LocalStorageOptions
{
    public string StoragePath { get; set; } = "wwwroot/uploads";
    public string PublicBaseUrl { get; set; } = "http://localhost:5002";
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
        _log.LogInformation("LocalFileStorage (Trips) inicializado en: {Path}", _rootPath);
    }

    public async Task<StoredFile> UploadAsync(Stream fileStream, string originalFileName, string mimeType,
                                              string folderPath, CancellationToken ct = default)
    {
        var safeFolder = Sanitize(folderPath);
        var folder = Path.Combine(_rootPath, safeFolder);
        Directory.CreateDirectory(folder);

        var diskName = $"{Guid.NewGuid():N}_{SanitizeFileName(originalFileName)}";
        var fullPath = Path.Combine(folder, diskName);

        await using(var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write))
        {
            await fileStream.CopyToAsync(fs, ct);
        }

        var size = new FileInfo(fullPath).Length;
        var relativePath = Path.Combine(safeFolder, diskName).Replace('\\', '/');
        // URL RELATIVA (igual que Auth/Drivers): el cliente le pone el host correcto.
        var publicUrl = $"{_opt.PublicUrlPath.TrimEnd('/')}/{relativePath}";

        return new StoredFile(relativePath, publicUrl, originalFileName, mimeType, size);
    }

    public Task DeleteAsync(string storageFileId, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(_rootPath, Sanitize(storageFileId));
        if(System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath);
        return Task.CompletedTask;
    }

    public Task<Stream> DownloadAsync(string storageFileId, CancellationToken ct = default)
    {
        var fullPath = Path.Combine(_rootPath, Sanitize(storageFileId));
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
