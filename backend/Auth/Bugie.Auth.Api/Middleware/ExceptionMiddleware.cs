using System.Net;
using System.Text.Json;

namespace Bugie.Auth.Api.Middleware;

/// <summary>
/// Captura excepciones y devuelve JSON limpio.
/// El mismo middleware se copia a cada API — cada una es independiente.
/// </summary>
public class ExceptionMiddleware
{
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
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error no controlado");
            await WriteError(ctx, ex);
        }
    }

    private static Task WriteError(HttpContext ctx, Exception ex)
    {
        var (status, message) = ex switch
        {
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized,   ex.Message),
            InvalidOperationException   => (HttpStatusCode.BadRequest,     ex.Message),
            KeyNotFoundException        => (HttpStatusCode.NotFound,       ex.Message),
            _                          => (HttpStatusCode.InternalServerError, "Error interno del servidor.")
        };

        ctx.Response.StatusCode  = (int)status;
        ctx.Response.ContentType = "application/json";

        return ctx.Response.WriteAsync(JsonSerializer.Serialize(new { error = message }));
    }
}