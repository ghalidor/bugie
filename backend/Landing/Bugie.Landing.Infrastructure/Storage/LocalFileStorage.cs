using Microsoft.Extensions.Configuration;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Storage;

/// <summary>
/// Archivos en la carpeta unica de subidas (LocalStorage:StoragePath, ej. C:/bugie-uploads),
/// la misma que usan Auth, Drivers y Trips. Landing los sirve en /uploads.
/// </summary>
public class LocalFileStorage : IFileStorage
{
    private readonly string _root;
    private readonly string _publicPath;
    private readonly string _publicBaseUrl;

    public LocalFileStorage(IConfiguration cfg)
    {
        var path = cfg["LocalStorage:StoragePath"] ?? "wwwroot/uploads";
        _root = Path.IsPathRooted(path) ? path : Path.Combine(AppContext.BaseDirectory, path);
        _publicPath = (cfg["LocalStorage:PublicUrlPath"] ?? "/uploads").TrimEnd('/');
        _publicBaseUrl = (cfg["LocalStorage:PublicBaseUrl"] ?? "http://localhost:5005").TrimEnd('/');
        Directory.CreateDirectory(_root);
    }

    public async Task<string> SaveAsync(Stream content, string originalFileName, string folder, CancellationToken ct = default)
    {
        var safeFolder = folder.Replace("..", "").Replace('\\', '/').Trim('/');
        var dir = Path.Combine(_root, safeFolder);
        Directory.CreateDirectory(dir);

        var ext = Path.GetExtension(originalFileName).ToLowerInvariant();
        var name = $"{Guid.NewGuid():N}{ext}";
        await using(var fs = new FileStream(Path.Combine(dir, name), FileMode.Create, FileAccess.Write))
            await content.CopyToAsync(fs, ct);

        return $"{_publicPath}/{safeFolder}/{name}";
    }

    public string ToAbsoluteUrl(string? relativeUrl)
    {
        if(string.IsNullOrWhiteSpace(relativeUrl)) return "";
        if(relativeUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
           || relativeUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return relativeUrl;
        return _publicBaseUrl + (relativeUrl.StartsWith('/') ? "" : "/") + relativeUrl;
    }
}
