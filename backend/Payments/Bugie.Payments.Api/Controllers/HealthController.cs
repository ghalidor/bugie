using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Payments.Api.Controllers;

/// <summary>
/// Endpoint público para verificar que la API esté viva.
/// Lo usa el dashboard admin y servicios externos de monitoreo.
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
        service = "payments",
        time = DateTime.UtcNow,
    });
}