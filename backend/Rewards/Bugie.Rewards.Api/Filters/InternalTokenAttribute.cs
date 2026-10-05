using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Bugie.Rewards.Api.Filters;

/// <summary>
/// Exige el header X-Internal-Token (appsettings: InternalToken) en todas las
/// acciones del controlador donde se aplica. Comparacion de tiempo constante.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class InternalTokenAttribute : Attribute, IAuthorizationFilter
{
    public const string Header = "X-Internal-Token";

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var cfg = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var expected = cfg["InternalToken"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(expected))
        {
            context.Result = new ObjectResult(new { error = "Configuracion incompleta." }) { StatusCode = 500 };
            return;
        }

        var token = context.HttpContext.Request.Headers[Header].ToString();
        if (!Matches(token, expected))
            context.Result = new UnauthorizedObjectResult(new { error = "Token interno invalido." });
    }

    public static bool Matches(string? token, string expected) =>
        !string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(expected) &&
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(expected));
}
