using System.Text.Json;
using FluentValidation;

namespace Bugie.Drivers.Api.Middleware;

/// <summary>
/// Captura las excepciones no controladas y devuelve JSON limpio, SIN detalles
/// internos (ni stack ni ex.Message de errores inesperados), tambien en Development.
/// El detalle completo queda en el log.
///   ValidationException (FluentValidation)        -> 400 con los mensajes de validacion
///   ConflictException / PayoutAlreadyRegistered   -> 409 con su mensaje
///   KeyNotFoundException                          -> 404 con su mensaje
///   UnauthorizedAccessException                   -> 401 con su mensaje
///   ArgumentException / InvalidOperationException -> 400 con su mensaje
///   AdminPermissionsUnavailableException          -> 503
///   cualquier otra                                -> 500 { error: "Ocurrio un error inesperado..." }
/// Las de negocio solo devuelven su mensaje si las lanzo codigo de Bugie
/// (ex.Source = "Bugie.*"). Si las lanzo el framework o una libreria (p.ej. un
/// InvalidOperationException de Npgsql o de LINQ), su texto es interno: 500 generico.
/// El mismo middleware esta en las 6 APIs (Auth agrega sus casos de BD).
/// </summary>
public class ExceptionMiddleware
{
    public const string UnexpectedMessage = "Ocurrió un error inesperado. Intenta de nuevo.";

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
        => (_next, _logger) = (next, logger);

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await _next(ctx);
        }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            // El cliente cerro la conexion: no hay a quien responder.
        }
        catch (Exception ex)
        {
            var (status, message) = Map(ex);
            if (status >= 500)
                _logger.LogError(ex, "Error no controlado en {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
            else
                _logger.LogInformation("{Status} en {Method} {Path}: {Message}", status, ctx.Request.Method, ctx.Request.Path, message);

            if (ctx.Response.HasStarted) throw;   // ya se enviaron cabeceras: no se puede reescribir

            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { error = message }));
        }
    }

    public static (int Status, string Message) Map(Exception ex)
    {
        if (ex is ValidationException v) return (400, ValidationMessage(v));
        if (ex is Bugie.Security.AdminPermissionsUnavailableException)
            return (503, Bugie.Security.AdminPermissions.UnavailableMessage);

        var fromBugie = ex.Source?.StartsWith("Bugie", StringComparison.Ordinal) == true;
        if (fromBugie)
        {
            if (ex.GetType().Name is "ConflictException" or "PayoutAlreadyRegisteredException")
                return (409, ex.Message);
            switch (ex)
            {
                case KeyNotFoundException: return (404, ex.Message);
                case UnauthorizedAccessException: return (401, ex.Message);
                case ArgumentException: return (400, ex.Message);
                case InvalidOperationException: return (400, ex.Message);
            }
        }
        return (500, UnexpectedMessage);
    }

    private static string ValidationMessage(ValidationException v)
    {
        var msgs = v.Errors?.Select(e => e.ErrorMessage).Where(m => !string.IsNullOrWhiteSpace(m)).Distinct().ToList();
        return msgs is { Count: > 0 } ? string.Join(" ", msgs) : "Datos inválidos.";
    }
}
