using Microsoft.AspNetCore.Mvc;

namespace Bugie.Rewards.Api.Controllers;

[ApiController]
[Route("api/rewards/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        service = "rewards",
        status  = "ok",
        utc     = DateTime.UtcNow
    });
}
