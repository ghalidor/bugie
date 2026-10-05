using Bugie.Trips.Infrastructure.Storage;

namespace Bugie.Trips.Api.Security;

/// <summary>
/// Validación del archivo subido ANTES de guardarlo: extensión en lista blanca
/// y tipo real por magic bytes (JPG/PNG/WEBP; PDF/HEIC solo donde se indique).
/// Devuelve el mensaje de error (para un 400) o null si está bien.
/// El almacenamiento vuelve a validar (defensa en profundidad).
/// </summary>
public static class UploadCheck
{
    private static readonly string[] ImageExt = { ".jpg", ".jpeg", ".jfif", ".png", ".webp" };

    public static string? Error(IFormFile? file, bool allowPdf = false, bool allowHeic = false)
    {
        if (file is null || file.Length == 0) return "Archivo vacío.";

        var ext = Path.GetExtension(file.FileName ?? "").ToLowerInvariant();
        var extOk = ImageExt.Contains(ext) || (allowPdf && ext == ".pdf")
                    || (allowHeic && (ext == ".heic" || ext == ".heif"))
                    || ext == "";   // algunas apps mandan el archivo sin extensión: manda el contenido
        if (!extOk) return FileSignature.RejectMessage(allowPdf, allowHeic);

        using var s = file.OpenReadStream();
        var kind = FileSignature.Detect(s);
        return FileSignature.IsAllowed(kind, allowPdf, allowHeic)
            ? null
            : FileSignature.RejectMessage(allowPdf, allowHeic);
    }
}
