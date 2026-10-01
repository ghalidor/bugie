using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Endpoint público para verificar que la API esté viva.
/// Lo usa el dashboard admin y servicios externos de monitoreo (Railway, Docker, etc).
/// </summary>
[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        status = "ok",
        service = "auth",
        time = DateTime.UtcNow,
    });
}