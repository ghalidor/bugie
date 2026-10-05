using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Landing.Application.Commands;
using Bugie.Landing.Application.Email;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Api.Controllers;

/// <summary>
/// Datos de la empresa (razon social, RUC, direccion fiscal y logo).
/// Viven en landing.systemsettings; telefono y correo son los de soporte.
///   Publico: GET  /api/landing/company
///   Admin:   PUT  /api/landing/admin/company
///            POST /api/landing/admin/company/logo  (multipart, campo "file")
/// </summary>
[ApiController]
[Route("api/landing")]
public class CompanyController : ControllerBase
{
    private const long MaxLogoBytes = 2 * 1024 * 1024;
    private static readonly string[] LogoExtensions = [".png", ".jpg", ".jpeg", ".webp"];

    private readonly IMediator _mediator;
    private readonly ISettingsRepository _settings;
    private readonly IFileStorage _files;

    public CompanyController(IMediator mediator, ISettingsRepository settings, IFileStorage files)
        => (_mediator, _settings, _files) = (mediator, settings, files);

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("company")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(CancellationToken ct) =>
        Ok(await CompanyInfo.LoadAsync(_settings, ct));

    [HttpPut("admin/company")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewCompany)]
    public async Task<IActionResult> Update([FromBody] CompanyRequest req, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(new UpdateCompanyCommand(
                req.LegalName, req.Ruc, req.Address, req.LogoUrl, CurrentUserId), ct));
        }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>Sube el logo y lo deja guardado como company_logo_url.</summary>
    [HttpPost("admin/company/logo")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewCompany)]
    [RequestSizeLimit(MaxLogoBytes + 64 * 1024)]
    public async Task<IActionResult> UploadLogo(IFormFile? file, CancellationToken ct)
    {
        if(file is null || file.Length == 0)
            return BadRequest(new { error = "Selecciona una imagen." });
        if(file.Length > MaxLogoBytes)
            return BadRequest(new { error = "El logo no puede pesar más de 2 MB." });
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if(!LogoExtensions.Contains(ext))
            return BadRequest(new { error = "Formato no permitido. Usa PNG, JPG o WEBP." });

        await using var stream = file.OpenReadStream();
        var url = await _files.SaveAsync(stream, file.FileName, "company", ct);

        var setting = await _settings.GetByKeyAsync("company_logo_url", ct);
        if(setting is null)
            return StatusCode(500, new { error = "Falta la clave company_logo_url. Ejecuta backend/scripts/2026-10-03_reclamaciones.sql." });
        setting.Update(url, CurrentUserId);
        await _settings.UpdateAsync(setting, ct);

        return Ok(await CompanyInfo.LoadAsync(_settings, ct));
    }
}

public record CompanyRequest(string? LegalName, string? Ruc, string? Address, string? LogoUrl);
