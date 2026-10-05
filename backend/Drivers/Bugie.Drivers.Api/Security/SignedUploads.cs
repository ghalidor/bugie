using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Options;

namespace Bugie.Api.Security;

/// <summary>
/// URLs firmadas para los archivos sensibles de /uploads (documentos de
/// conductor y pasajero, selfies de conexión, fotos de envíos).
///
/// Este archivo es IDÉNTICO en Auth, Drivers y Trips (las 3 sirven la misma
/// carpeta de archivos). Las 3 deben usar la misma clave.
///
///  - Públicos (sin firma): profiles/..., vehicles/... y drivers/{id}/profile/...
///  - Todo lo demás bajo /uploads exige ?exp=&lt;unix&gt;&amp;sig=&lt;HMAC&gt;.
///    sig = base64url(HMAC-SHA256(clave, "&lt;ruta&gt;|&lt;exp&gt;")), ruta = "/uploads/...".
///  - Clave: "Uploads:SigningKey"; si no existe, "InternalToken".
///  - Vigencia: entre 30 y 60 minutos (la URL no cambia dentro de cada
///    bloque de 30 min, así el navegador/app puede reutilizar la caché).
///
/// Las respuestas JSON se firman solas (SignUploadUrlsFilter): cualquier
/// string que sea una URL de un archivo sensible sale ya firmada.
/// </summary>
public static class SignedUploads
{
    private const int WindowMinutes = 30;
    private static byte[] _key = Array.Empty<byte>();
    private static string _publicUrl = "/uploads";

    public static bool Enabled => _key.Length > 0;

    /// <summary>Lee la clave y la ruta pública. Llamar una vez en Program.cs.</summary>
    public static void Configure(IConfiguration cfg)
    {
        var key = cfg["Uploads:SigningKey"];
        if (string.IsNullOrWhiteSpace(key)) key = cfg["InternalToken"];
        _key = string.IsNullOrWhiteSpace(key) ? Array.Empty<byte>() : Encoding.UTF8.GetBytes(key);
        _publicUrl = "/" + (cfg["LocalStorage:PublicUrlPath"] ?? "/uploads").Trim('/');
    }

    // ── Clasificación ─────────────────────────────────────────────────────

    /// <summary>True si la ruta relativa (sin "/uploads/") se puede servir sin firma.</summary>
    public static bool IsPublic(string relative)
    {
        var s = relative.Split('/');
        if (s.Length >= 2 && (Eq(s[0], "profiles") || Eq(s[0], "vehicles"))) return true;
        return s.Length >= 4 && Eq(s[0], "drivers") && Eq(s[2], "profile");
    }

    private static bool Eq(string a, string b) => string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    // ── Firma ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Devuelve la URL firmada si apunta a un archivo sensible de /uploads
    /// (relativa "/uploads/..." o absoluta "http://host/uploads/...").
    /// Cualquier otra cosa se devuelve igual.
    /// </summary>
    public static string Sign(string url)
    {
        if (!Enabled || string.IsNullOrEmpty(url)) return url;

        var q = url.IndexOf('?');
        var baseUrl = q >= 0 ? url[..q] : url;

        string path;
        string prefix = "";
        if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            var slash = baseUrl.IndexOf('/', baseUrl.IndexOf("//", StringComparison.Ordinal) + 2);
            if (slash < 0) return url;
            prefix = baseUrl[..slash];
            path = Uri.UnescapeDataString(baseUrl[slash..]);
        }
        else
        {
            path = baseUrl;
        }

        if (!path.StartsWith(_publicUrl + "/", StringComparison.OrdinalIgnoreCase)) return url;
        if (IsPublic(path[(_publicUrl.Length + 1)..])) return url;

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var window = WindowMinutes * 60L;
        var exp = (now / window + 2) * window;
        return $"{prefix}{path}?exp={exp}&sig={Hmac(path, exp)}";
    }

    public static bool Verify(string path, string? exp, string? sig)
    {
        if (!Enabled || string.IsNullOrEmpty(exp) || string.IsNullOrEmpty(sig)) return false;
        if (!long.TryParse(exp, out var expUnix)) return false;
        if (expUnix < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return false;
        var expected = Encoding.ASCII.GetBytes(Hmac(path, expUnix));
        var given = Encoding.ASCII.GetBytes(sig);
        return CryptographicOperations.FixedTimeEquals(expected, given);
    }

    private static string Hmac(string path, long exp)
    {
        var hash = HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"{path}|{exp}"));
        return Convert.ToBase64String(hash).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    /// <summary>Firma, dentro de un JSON, todos los strings que sean URLs sensibles. True si cambió algo.</summary>
    public static bool SignInPlace(JsonNode? node)
    {
        var changed = false;
        switch (node)
        {
            case JsonObject obj:
                foreach (var key in obj.Select(p => p.Key).ToList())
                {
                    var child = obj[key];
                    if (child is JsonValue v && v.TryGetValue<string>(out var s))
                    {
                        var signed = Sign(s);
                        if (!ReferenceEquals(signed, s)) { obj[key] = signed; changed = true; }
                    }
                    else changed |= SignInPlace(child);
                }
                break;
            case JsonArray arr:
                for (var i = 0; i < arr.Count; i++)
                {
                    var child = arr[i];
                    if (child is JsonValue v && v.TryGetValue<string>(out var s))
                    {
                        var signed = Sign(s);
                        if (!ReferenceEquals(signed, s)) { arr[i] = signed; changed = true; }
                    }
                    else changed |= SignInPlace(child);
                }
                break;
        }
        return changed;
    }

    // ── Servido de /uploads ───────────────────────────────────────────────

    /// <summary>
    /// Middleware: va ANTES de UseStaticFiles. Rechaza (403) las peticiones a
    /// archivos sensibles sin firma válida o vencida, y rutas raras.
    /// </summary>
    public static IApplicationBuilder UseSignedUploads(this IApplicationBuilder app) =>
        app.Use(async (ctx, next) =>
        {
            var path = ctx.Request.Path.Value ?? "";
            if (path.StartsWith(_publicUrl + "/", StringComparison.OrdinalIgnoreCase))
            {
                var relative = path[(_publicUrl.Length + 1)..];
                var weird = relative.Contains("..") || relative.Contains('\\') || relative.Contains(':')
                            || relative.Contains("//");
                if (weird || (!IsPublic(relative)
                              && !Verify(path, ctx.Request.Query["exp"], ctx.Request.Query["sig"])))
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }
            }
            await next();
        });

    /// <summary>Cabeceras para lo servido desde /uploads (OnPrepareResponse de UseStaticFiles).</summary>
    public static void PrepareResponse(StaticFileResponseContext ctx)
    {
        var headers = ctx.Context.Response.Headers;
        headers["X-Content-Type-Options"] = "nosniff";
        var type = ctx.Context.Response.ContentType ?? "";
        if (type.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            headers["Content-Disposition"] = "inline";
        // Los archivos firmados no deben quedar en cachés compartidas.
        if (!IsPublic(ctx.Context.Request.Path.Value?[(_publicUrl.Length + 1)..] ?? ""))
            headers["Cache-Control"] = "private, max-age=1800";
    }
}

/// <summary>
/// Filtro global de MVC: firma las URLs sensibles de /uploads en cualquier
/// respuesta JSON (DTOs de documentos, historial de conexiones, fotos de
/// envíos, detalle admin...). Así ningún endpoint se queda sin firmar.
/// </summary>
public class SignUploadUrlsFilter : IAsyncResultFilter
{
    public Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        if (SignedUploads.Enabled && context.Result is ObjectResult { Value: not null } result
            && result.Value is not string && result.Value is not ProblemDetails)
        {
            var options = context.HttpContext.RequestServices
                .GetService<IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>()?.Value.JsonSerializerOptions
                ?? new JsonSerializerOptions(JsonSerializerDefaults.Web);

            var node = JsonSerializer.SerializeToNode(result.Value, result.Value.GetType(), options);
            if (SignedUploads.SignInPlace(node))
            {
                result.Value = node;
                result.DeclaredType = typeof(JsonNode);
            }
        }
        return next();
    }
}
