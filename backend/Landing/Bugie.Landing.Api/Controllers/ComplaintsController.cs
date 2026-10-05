using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Landing.Application.Commands;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Api.Controllers;

/// <summary>
/// Libro de Reclamaciones (formato Indecopi). Plazo y "por vencer" en dias
/// habiles segun la configuracion (complaint_response_days / complaint_due_soon_days)
/// y los feriados activos.
///   Publico: POST /api/landing/complaints, GET /api/landing/complaints/{code}?t=token
///   Admin:   GET  /api/landing/admin/complaints (listado), /stats, /summary, /{id}
///            POST /api/landing/admin/complaints/{id}/reply
///            POST /api/landing/admin/complaints/{id}/discard  { reason } (posible bot -> descartada)
///            POST /api/landing/admin/complaints/{id}/void     { reason } (pendiente -> anulada)
///            POST /api/landing/admin/complaints/{id}/valid    (posible bot -> valida + correo)
/// Anular y descartar exigen motivo y no envian ningun correo al consumidor.
/// </summary>
[ApiController]
[Route("api/landing")]
public class ComplaintsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IComplaintRepository _repo;
    private readonly ISettingsRepository _settings;
    private readonly IHolidayRepository _holidays;

    public ComplaintsController(IMediator mediator, IComplaintRepository repo,
        ISettingsRepository settings, IHolidayRepository holidays)
        => (_mediator, _repo, _settings, _holidays) = (mediator, repo, settings, holidays);

    private Task<ComplaintPolicy> PolicyAsync(CancellationToken ct) =>
        ComplaintPolicy.LoadAsync(_settings, _holidays, ct);

    private Guid? UserIdOrNull =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    /// <summary>Id y nombre del admin (se guardan en la respuesta y en el cierre).</summary>
    private (Guid Id, string Name) Admin() => (
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
        User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? "Admin Bugie");

    // ── Publico ─────────────────────────────────────────────────────────

    [HttpPost("complaints")]
    [AllowAnonymous]
    public async Task<IActionResult> Create([FromBody] ComplaintRequest req, CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(new CreateComplaintCommand(
                req.ConsumerName, req.ConsumerAddress, req.DocType, req.DocNumber,
                req.Phone, req.Email, req.EmailConfirm, req.GuardianName,
                req.GoodType, req.ClaimedAmount, req.GoodDescription,
                req.ComplaintType, req.TripId, req.TripCode, req.Reference,
                req.Detail, req.Request,
                // Si llega con sesion iniciada, se guarda quien la envio.
                UserIdOrNull,
                // Campo trampa: una persona no lo ve ni lo llena.
                req.Website), ct);
            return Ok(result);
        }
        catch(ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("complaints/{code}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublic(string code, [FromQuery] string? t, CancellationToken ct)
    {
        var c = await _repo.GetByCodeAsync(code.Trim().ToUpperInvariant(), ct);
        // Mismo mensaje si no existe o el token no coincide (no revela codigos validos).
        if(c is null || string.IsNullOrEmpty(t) || !SameToken(c.AccessToken, t))
            return NotFound(new { error = "No encontramos la reclamación. Revisa el enlace de tu correo." });
        return Ok(ComplaintPublicDto.From(c));
    }

    private static bool SameToken(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    // ── Admin ───────────────────────────────────────────────────────────

    /// <summary>
    /// GET /api/landing/admin/complaints?status=pendiente|por_vencer|vencida|respondida|posible_bot|descartada&amp;type=reclamo|queja&amp;search=&amp;from=&amp;to=&amp;page=1&amp;pageSize=20
    /// from / to: dias de Peru (yyyy-MM-dd) de registro de la hoja, ambos incluidos.
    /// </summary>
    [HttpGet("admin/complaints")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public async Task<IActionResult> GetPaged(
        [FromQuery] string? status = null,
        [FromQuery] string? type = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var today = BugieTime.Today;
        var policy = await PolicyAsync(ct);
        var (items, total) = await _repo.GetPagedAsync(
            status, type, search, today, policy.DueSoonLimit(today), page, pageSize, ct,
            from is null ? null : BugieTime.PeruToUtc(from.Value.Date),
            to   is null ? null : BugieTime.PeruToUtc(to.Value.Date.AddDays(1)));
        return Ok(new
        {
            items = items.Select(c => ComplaintAdminDto.From(c, today, policy.Calendar)),
            page, pageSize, total,
        });
    }

    /// <summary>
    /// GET /api/landing/admin/complaints/stats →
    /// { pending, dueSoon, overdue, answered, bots, discarded, voided, responseDays, dueSoonDays }
    /// (posibles bots, anuladas y descartadas no cuentan en pendientes, por vencer ni vencidas).
    /// </summary>
    [HttpGet("admin/complaints/stats")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public async Task<IActionResult> GetStats(CancellationToken ct)
    {
        var today = BugieTime.Today;
        var policy = await PolicyAsync(ct);
        var s = await _repo.GetStatsAsync(today, policy.DueSoonLimit(today), ct);
        return Ok(new
        {
            pending = s.Pending, dueSoon = s.DueSoon, overdue = s.Overdue, answered = s.Answered,
            bots = s.Bots, discarded = s.Discarded, voided = s.Voided,
            responseDays = policy.ResponseDays, dueSoonDays = policy.DueSoonDays,
        });
    }

    /// <summary>GET /api/landing/admin/complaints/summary → { pending, overdue } (centro de avisos, sin posibles bots).</summary>
    [HttpGet("admin/complaints/summary")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
    {
        var today = BugieTime.Today;
        var policy = await PolicyAsync(ct);
        var s = await _repo.GetStatsAsync(today, policy.DueSoonLimit(today), ct);
        return Ok(new { pending = s.Pending, overdue = s.Overdue });
    }

    [HttpGet("admin/complaints/{id:guid}")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public async Task<IActionResult> GetDetail(Guid id, CancellationToken ct)
    {
        var c = await _repo.GetByIdAsync(id, ct);
        if(c is null) return NotFound(new { error = "Reclamación no encontrada." });
        var policy = await PolicyAsync(ct);
        return Ok(ComplaintAdminDto.From(c, BugieTime.Today, policy.Calendar));
    }

    /// <summary>POST /api/landing/admin/complaints/{id}/discard  Body: { reason }: posible bot -> 'descartada' (sin correos).</summary>
    [HttpPost("admin/complaints/{id:guid}/discard")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public Task<IActionResult> Discard(Guid id, [FromBody] ComplaintCloseRequest? req, CancellationToken ct) =>
        Close(id, ComplaintCloseAction.Discard, req?.Reason, ct);

    /// <summary>POST /api/landing/admin/complaints/{id}/void  Body: { reason }: pendiente -> 'anulada' (sin correos).</summary>
    [HttpPost("admin/complaints/{id:guid}/void")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public Task<IActionResult> Void(Guid id, [FromBody] ComplaintCloseRequest? req, CancellationToken ct) =>
        Close(id, ComplaintCloseAction.Void, req?.Reason, ct);

    private async Task<IActionResult> Close(Guid id, ComplaintCloseAction action, string? reason, CancellationToken ct)
    {
        var (adminId, adminName) = Admin();
        try
        {
            return Ok(await _mediator.Send(new CloseComplaintCommand(id, action, reason, adminId, adminName), ct));
        }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    /// <summary>POST /api/landing/admin/complaints/{id}/valid: quita la marca de bot, nuevo plazo desde hoy y correo.</summary>
    [HttpPost("admin/complaints/{id:guid}/valid")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public async Task<IActionResult> MarkValid(Guid id, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(new MarkComplaintValidCommand(id), ct));
        }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    /// <summary>POST /api/landing/admin/complaints/{id}/reply  Body: { response }</summary>
    [HttpPost("admin/complaints/{id:guid}/reply")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewComplaints)]
    public async Task<IActionResult> Reply(Guid id, [FromBody] ComplaintReplyRequest req, CancellationToken ct)
    {
        var (adminId, adminName) = Admin();
        try
        {
            return Ok(await _mediator.Send(new ReplyComplaintCommand(id, req.Response, adminId, adminName), ct));
        }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }
}

public record ComplaintRequest(
    string? ConsumerName, string? ConsumerAddress, string? DocType, string? DocNumber,
    string? Phone, string? Email, string? EmailConfirm, string? GuardianName,
    string? GoodType, decimal? ClaimedAmount, string? GoodDescription,
    string? ComplaintType, Guid? TripId, string? TripCode, string? Reference,
    string? Detail, string? Request,
    string? Website = null);

public record ComplaintReplyRequest(string? Response);

public record ComplaintCloseRequest(string? Reason);
