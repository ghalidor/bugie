namespace Bugie.Auth.Infrastructure.Storage;

/// <summary>
/// Detecta el tipo REAL de un archivo por sus primeros bytes (magic bytes),
/// sin fiarse del nombre ni del Content-Type que manda el cliente.
/// Mismo archivo en Auth, Drivers y Trips (solo cambia el namespace).
/// </summary>
public static class FileSignature
{
    public sealed record Kind(string Extension, string MimeType, bool IsImage);

    public static readonly Kind Jpeg = new(".jpg", "image/jpeg", true);
    public static readonly Kind Png  = new(".png", "image/png", true);
    public static readonly Kind Webp = new(".webp", "image/webp", true);
    public static readonly Kind Heic = new(".heic", "image/heic", true);
    public static readonly Kind Pdf  = new(".pdf", "application/pdf", false);

    private static readonly string[] HeicBrands = { "heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1" };

    /// <summary>Lee los primeros bytes y deja el stream donde estaba (si se puede).</summary>
    public static Kind? Detect(Stream s)
    {
        var buf = new byte[16];
        var start = s.CanSeek ? s.Position : 0;
        var n = 0;
        while (n < buf.Length)
        {
            var r = s.Read(buf, n, buf.Length - n);
            if (r == 0) break;
            n += r;
        }
        if (s.CanSeek) s.Position = start;
        return Detect(buf.AsSpan(0, n));
    }

    public static Kind? Detect(ReadOnlySpan<byte> h)
    {
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return Jpeg;
        if (h.Length >= 8 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47
            && h[4] == 0x0D && h[5] == 0x0A && h[6] == 0x1A && h[7] == 0x0A) return Png;
        if (h.Length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
            && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return Webp;
        if (h.Length >= 5 && h[0] == '%' && h[1] == 'P' && h[2] == 'D' && h[3] == 'F' && h[4] == '-') return Pdf;
        if (h.Length >= 12 && h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p')
        {
            var brand = System.Text.Encoding.ASCII.GetString(h.Slice(8, 4)).ToLowerInvariant();
            if (HeicBrands.Contains(brand)) return Heic;
        }
        return null;
    }

    /// <summary>JPG/PNG/WEBP siempre; PDF y HEIC solo si se indican.</summary>
    public static bool IsAllowed(Kind? k, bool allowPdf = false, bool allowHeic = false) =>
        k is not null && (k == Jpeg || k == Png || k == Webp
                          || (allowPdf && k == Pdf) || (allowHeic && k == Heic));

    public static string RejectMessage(bool allowPdf = false, bool allowHeic = false) =>
        allowPdf ? "Archivo inválido: solo se aceptan JPG, PNG, WEBP o PDF."
        : allowHeic ? "Archivo inválido: solo se aceptan fotos JPG, PNG, WEBP o HEIC."
        : "Archivo inválido: solo se aceptan imágenes JPG, PNG o WEBP.";

    /// <summary>
    /// Devuelve un stream que se puede rebobinar (copia a memoria si hace falta).
    /// </summary>
    public static async Task<Stream> EnsureSeekableAsync(Stream s, CancellationToken ct)
    {
        if (s.CanSeek) return s;
        var ms = new MemoryStream();
        await s.CopyToAsync(ms, ct);
        ms.Position = 0;
        return ms;
    }
}
