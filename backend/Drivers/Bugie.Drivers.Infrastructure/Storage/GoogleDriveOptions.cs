using Bugie.Drivers.Domain.External;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Drive.v3;
using Google.Apis.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

// Alias para evitar ambigüedad entre Google.Apis.Drive.v3.Data.File y System.IO.File
using DriveFile = Google.Apis.Drive.v3.Data.File;
using DrivePermission = Google.Apis.Drive.v3.Data.Permission;

namespace Bugie.Drivers.Infrastructure.Storage;

/// <summary>
/// Configuración leída desde appsettings.json sección "GoogleDrive".
/// </summary>
public class GoogleDriveOptions
{
    public string CredentialsJsonPath { get; set; } = string.Empty;
    public string RootFolderId { get; set; } = string.Empty;
    public string ApplicationName { get; set; } = "Bugie";
}

public class GoogleDriveStorageService : IDriveStorageService
{
    private readonly DriveService _drive;
    private readonly GoogleDriveOptions _opt;
    private readonly ILogger<GoogleDriveStorageService> _log;

    // Cache de IDs de carpeta por path (folderPath → folderId)
    private readonly Dictionary<string, string> _folderCache = new();

    public GoogleDriveStorageService(
        IOptions<GoogleDriveOptions> opt,
        ILogger<GoogleDriveStorageService> log)
    {
        _opt = opt.Value;
        _log = log;

        if(string.IsNullOrWhiteSpace(_opt.CredentialsJsonPath) ||
            !System.IO.File.Exists(_opt.CredentialsJsonPath))
        {
            throw new InvalidOperationException(
                $"No se encontró el archivo de credenciales: '{_opt.CredentialsJsonPath}'. " +
                "Revisa la sección GoogleDrive en appsettings.json.");
        }

        GoogleCredential credential;
        using(var stream = new FileStream(_opt.CredentialsJsonPath, FileMode.Open, FileAccess.Read))
        {
            credential = GoogleCredential
                .FromStream(stream)
                .CreateScoped(DriveService.ScopeConstants.Drive);
        }

        _drive = new DriveService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = _opt.ApplicationName,
        });
    }

    public async Task<StoredFile> UploadAsync(
        Stream fileStream, string originalFileName, string mimeType,
        string folderPath, CancellationToken ct = default)
    {
        var folderId = await EnsureFolderAsync(folderPath, ct);

        var metadata = new DriveFile
        {
            Name = originalFileName,
            Parents = new List<string> { folderId },
        };

        var request = _drive.Files.Create(metadata, fileStream, mimeType);
        request.Fields = "id, webViewLink, webContentLink, mimeType, size, name";
        var progress = await request.UploadAsync(ct);

        if(progress.Status != Google.Apis.Upload.UploadStatus.Completed)
        {
            throw new InvalidOperationException(
                $"Fallo al subir a Drive: {progress.Exception?.Message ?? "desconocido"}");
        }

        var file = request.ResponseBody;

        // Permiso de lectura para que el admin pueda previsualizar sin login Google
        // (Comentar este bloque si prefieres mantener los docs privados — entonces
        // el admin descargará usando el endpoint /documents/{id}/download del backend)
        try
        {
            await _drive.Permissions
                .Create(new DrivePermission { Role = "reader", Type = "anyone" }, file.Id)
                .ExecuteAsync(ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo asignar permiso público al archivo {Id}", file.Id);
        }

        return new StoredFile(
            DriveFileId: file.Id,
            PreviewUrl: file.WebViewLink ?? $"https://drive.google.com/file/d/{file.Id}/view",
            OriginalFileName: file.Name,
            MimeType: file.MimeType ?? mimeType,
            SizeBytes: (long)(file.Size ?? 0));
    }

    public async Task DeleteAsync(string driveFileId, CancellationToken ct = default)
    {
        try
        {
            await _drive.Files.Delete(driveFileId).ExecuteAsync(ct);
        }
        catch(Google.GoogleApiException ex) when(ex.HttpStatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Ya no existe — lo consideramos OK
            _log.LogWarning("Archivo Drive {Id} no encontrado al eliminar", driveFileId);
        }
    }

    public async Task<Stream> DownloadAsync(string driveFileId, CancellationToken ct = default)
    {
        var request = _drive.Files.Get(driveFileId);
        var stream = new MemoryStream();
        await request.DownloadAsync(stream, ct);
        stream.Position = 0;
        return stream;
    }

    public async Task<(string MimeType, string FileName)> GetMetadataAsync(string driveFileId, CancellationToken ct = default)
    {
        var request = _drive.Files.Get(driveFileId);
        request.Fields = "id, name, mimeType";
        var file = await request.ExecuteAsync(ct);
        return (file.MimeType ?? "application/octet-stream", file.Name ?? "archivo");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helper: crea/encuentra una subcarpeta dentro de RootFolderId
    // Ejemplo de folderPath: "drivers/abc-123-uuid"
    // ─────────────────────────────────────────────────────────────────────
    private async Task<string> EnsureFolderAsync(string folderPath, CancellationToken ct)
    {
        if(_folderCache.TryGetValue(folderPath, out var cached)) return cached;

        var parts = folderPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var parentId = _opt.RootFolderId;

        foreach(var part in parts)
        {
            var query = $"name = '{part.Replace("'", "\\'")}' " +
                        $"and mimeType = 'application/vnd.google-apps.folder' " +
                        $"and '{parentId}' in parents and trashed = false";

            var list = _drive.Files.List();
            list.Q = query;
            list.Fields = "files(id, name)";
            var found = await list.ExecuteAsync(ct);

            if(found.Files.Count > 0)
            {
                parentId = found.Files[0].Id;
            }
            else
            {
                var folder = new DriveFile
                {
                    Name = part,
                    MimeType = "application/vnd.google-apps.folder",
                    Parents = new List<string> { parentId },
                };
                var create = _drive.Files.Create(folder);
                create.Fields = "id";
                var created = await create.ExecuteAsync(ct);
                parentId = created.Id;
            }
        }

        _folderCache[folderPath] = parentId;
        return parentId;
    }
}