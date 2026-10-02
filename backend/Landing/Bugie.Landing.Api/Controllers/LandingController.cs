using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Landing.Application.Commands;
using Bugie.Landing.Application.Queries;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Api.Controllers;

[ApiController]
[Route("api/landing")]
public class LandingController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly INewsRepository _news;
    private readonly IFaqRepository _faq;

    public LandingController(IMediator mediator, INewsRepository news, IFaqRepository faq)
        => (_mediator, _news, _faq) = (mediator, news, faq);

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ── CMS ──────────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetContent(
        [FromQuery] string lang = "es", CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetLandingPageQuery(lang), ct));

    [HttpPut("section")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> UpdateSection(
        [FromBody] UpdateSectionRequest req, CancellationToken ct)
    {
        await _mediator.Send(
            new UpdateSectionContentCommand(req.SectionKey, req.Lang, req.ContentJson), ct);
        return Ok(new { updated = true });
    }

    // ── Noticias ─────────────────────────────────────────────────────────────

    [HttpGet("news")]
    public async Task<IActionResult> GetNews(
        [FromQuery] string lang = "es", CancellationToken ct = default)
    {
        var articles = await _news.GetPublishedAsync(lang, ct);
        return Ok(articles);
    }

    /// <summary>
    /// Admin: lista paginada de noticias (publicadas Y ocultas).
    /// GET /api/landing/news/paged?page=1&amp;pageSize=25&amp;lang=es&amp;search=&amp;tag=&amp;published=
    /// - published: true=solo publicadas, false=solo ocultas, omitir=ambas.
    /// </summary>
    [HttpGet("news/paged")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetNewsPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string lang = "es",
        [FromQuery] string? search = null,
        [FromQuery] string? tag = null,
        [FromQuery] bool? published = null,
        CancellationToken ct = default)
    {
        var (items, total) = await _news.GetPagedAsync(
            page, pageSize, lang, search, tag, published, ct);
        return Ok(new { items, page, pageSize, total });
    }

    /// <summary>
    /// Admin: KPIs (total, publicadas, ocultas). Respeta lang + search + tag.
    /// GET /api/landing/news/stats?lang=es&amp;search=&amp;tag=
    /// </summary>
    [HttpGet("news/stats")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetNewsStats(
        [FromQuery] string lang = "es",
        [FromQuery] string? search = null,
        [FromQuery] string? tag = null,
        CancellationToken ct = default)
    {
        var (total, published, hidden) =
            await _news.GetStatsAsync(lang, search, tag, ct);
        return Ok(new { total, published, hidden });
    }

    [HttpPost("news")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateNews(
        [FromBody] NewsRequest req, CancellationToken ct)
    {
        var article = new NewsArticle
        {
            Id = Guid.NewGuid(),
            Slug = req.Slug,
            Tag = req.Tag,
            Title = req.Title,
            Summary = req.Summary,
            Lang = req.Lang,
            // Sin indicar = publicada (como antes). false = borrador.
            IsPublished = req.IsPublished ?? true,
            PublishedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        };
        await _news.AddAsync(article, ct);
        return Ok(article);
    }

    [HttpPut("news/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> UpdateNews(
        Guid id, [FromBody] NewsRequest req, CancellationToken ct)
    {
        var existing = await _news.GetByIdAsync(id, ct);
        if(existing is null) return NotFound();

        existing.Slug = req.Slug;
        existing.Tag = req.Tag;
        existing.Title = req.Title;
        existing.Summary = req.Summary;
        // Al pasar de borrador a publicada, la fecha de publicacion es la de hoy.
        if(!existing.IsPublished && req.IsPublished == true)
            existing.PublishedAt = DateTime.UtcNow;
        existing.IsPublished = req.IsPublished ?? existing.IsPublished;

        await _news.UpdateAsync(existing, ct);
        return Ok(existing);
    }

    // ── Contacto ─────────────────────────────────────────────────────────────

    [HttpPost("contact")]
    public async Task<IActionResult> Contact(
        [FromBody] ContactRequest req, CancellationToken ct)
    {
        var id = await _mediator.Send(
            new SendContactCommand(req.Name, req.Email, req.Subject, req.Message), ct);
        return Ok(new { id, message = "Mensaje recibido. Te contactaremos pronto." });
    }

    [HttpGet("contact/unread")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetUnread(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetUnreadContactsQuery(), ct));

    /// <summary>
    /// GET /api/landing/contact?filter=all|unread|read&page=1&pageSize=20
    /// Lista paginada para la pantalla admin de mensajes.
    /// </summary>
    [HttpGet("contact")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetContactPaged(
        [FromQuery] string filter = "all",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetContactMessagesPagedQuery(filter, page, pageSize), ct));

    /// <summary>
    /// GET /api/landing/contact/{id}
    /// Detalle de un mensaje + todas sus respuestas.
    /// </summary>
    [HttpGet("contact/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetContactDetail(Guid id, CancellationToken ct)
    {
        var dto = await _mediator.Send(new GetContactDetailQuery(id), ct);
        if(dto is null) return NotFound(new { error = "Mensaje no encontrado." });
        return Ok(dto);
    }

    /// <summary>PUT /api/landing/contact/{id}/read  — marca como leído.</summary>
    [HttpPut("contact/{id:guid}/read")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new MarkContactAsReadCommand(id, CurrentUserId), ct);
        return Ok(new { ok = true });
    }

    /// <summary>PUT /api/landing/contact/{id}/unread  — vuelve a no leído.</summary>
    [HttpPut("contact/{id:guid}/unread")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> MarkUnread(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new MarkContactAsUnreadCommand(id), ct);
        return Ok(new { ok = true });
    }

    /// <summary>
    /// POST /api/landing/contact/{id}/reply
    /// Envía un correo de respuesta al remitente y guarda historial.
    /// Body: { subject, body }
    /// </summary>
    [HttpPost("contact/{id:guid}/reply")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Reply(
        Guid id, [FromBody] ReplyToContactRequest req, CancellationToken ct)
    {
        // El nombre del admin viene del JWT (claim ClaimTypes.Name o "fullName").
        var adminName = User.FindFirstValue("fullName")
                     ?? User.FindFirstValue(ClaimTypes.Name)
                     ?? "Admin Bugie";

        try
        {
            var reply = await _mediator.Send(new ReplyToContactCommand(
                ContactId: id,
                AdminUserId: CurrentUserId,
                AdminName: adminName,
                Subject: req.Subject ?? "",
                Body: req.Body ?? ""), ct);
            return Ok(reply);
        }
        catch(KeyNotFoundException)
        {
            return NotFound(new { error = "Mensaje no encontrado." });
        }
        catch(ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    public record ReplyToContactRequest(string? Subject, string? Body);

    // ── Configuración ─────────────────────────────────────────────────────────

    [HttpGet("settings")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSettings(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetSettingsQuery(), ct));

    // Lo usan Auth y Drivers (LandingSettingsClient) para leer una sola clave,
    // por ejemplo default_city.
    [HttpGet("settings/{key}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSetting(string key, CancellationToken ct)
    {
        var settings = await _mediator.Send(new GetSettingsQuery(), ct);
        var s = settings.FirstOrDefault(x =>
            string.Equals(x.SettingKey, key, StringComparison.OrdinalIgnoreCase));
        return s is null
            ? NotFound(new { error = $"No existe la clave '{key}'." })
            : Ok(new { settingKey = s.SettingKey, value = s.Value });
    }

    [HttpPut("settings/{key}")]
    [Authorize(Roles = "admin")]

    public async Task<IActionResult> UpdateSetting(
        string key, [FromBody] UpdateSettingRequest req, CancellationToken ct)
    {
        await _mediator.Send(new UpdateSettingCommand(key, req.Value, CurrentUserId), ct);
        return Ok(new { updated = true });
    }

    // ═════════════════════════════════════════════════════════════════════
    // FAQ (Preguntas Frecuentes)
    // ═════════════════════════════════════════════════════════════════════

    /// <summary>
    /// PÚBLICO: lista de preguntas publicadas para la landing.
    /// Agrupadas por categoría, ordenadas por SortOrder.
    /// GET /api/landing/faq?lang=es
    /// </summary>
    [HttpGet("faq")]
    public async Task<IActionResult> GetFaq(
        [FromQuery] string lang = "es", CancellationToken ct = default)
    {
        var items = await _faq.GetPublishedAsync(lang, ct);
        return Ok(items);
    }

    /// <summary>
    /// ADMIN: listado COMPLETO (incluye ocultas) para gestión.
    /// GET /api/landing/faq/admin?lang=es
    /// </summary>
    [HttpGet("faq/admin")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetFaqAdmin(
        [FromQuery] string lang = "es", CancellationToken ct = default)
    {
        var items = await _faq.GetAllAsync(lang, ct);
        return Ok(items);
    }

    /// <summary>
    /// ADMIN: crear una pregunta nueva. Se inserta al FINAL de su categoría
    /// (SortOrder = max + 1). Si IsPublished se omite, queda en true.
    /// POST /api/landing/faq
    /// </summary>
    [HttpPost("faq")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> CreateFaq(
        [FromBody] FaqRequest req, CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(req.Question) || string.IsNullOrWhiteSpace(req.Answer)
            || string.IsNullOrWhiteSpace(req.Category))
            return BadRequest(new { error = "Pregunta, respuesta y categoría son obligatorias." });

        var lang = string.IsNullOrWhiteSpace(req.Lang) ? "es" : req.Lang;
        // SortOrder = el siguiente disponible dentro de la categoría.
        var nextOrder = await _faq.GetMaxSortOrderAsync(lang, req.Category.Trim(), ct) + 1;

        var item = new FaqItem
        {
            Id = Guid.NewGuid(),
            Lang = lang,
            Category = req.Category.Trim(),
            Question = req.Question.Trim(),
            Answer = req.Answer.Trim(),
            IsPublished = req.IsPublished ?? true,
            SortOrder = nextOrder,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        await _faq.AddAsync(item, ct);
        return Ok(item);
    }

    /// <summary>
    /// ADMIN: editar pregunta existente. NO modifica SortOrder
    /// (eso se hace por /reorder). Si cambia de categoría, se reposiciona al final
    /// de la nueva categoría automáticamente.
    /// PUT /api/landing/faq/{id}
    /// </summary>
    [HttpPut("faq/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> UpdateFaq(
        Guid id, [FromBody] FaqRequest req, CancellationToken ct)
    {
        var existing = await _faq.GetByIdAsync(id, ct);
        if(existing is null) return NotFound();

        if(string.IsNullOrWhiteSpace(req.Question) || string.IsNullOrWhiteSpace(req.Answer)
            || string.IsNullOrWhiteSpace(req.Category))
            return BadRequest(new { error = "Pregunta, respuesta y categoría son obligatorias." });

        var newLang = string.IsNullOrWhiteSpace(req.Lang) ? existing.Lang : req.Lang;
        var newCategory = req.Category.Trim();

        // Si cambió de categoría o idioma, recalculamos SortOrder al final de la nueva.
        var changedBucket = newLang != existing.Lang || newCategory != existing.Category;
        var newSortOrder = changedBucket
            ? await _faq.GetMaxSortOrderAsync(newLang, newCategory, ct) + 1
            : existing.SortOrder;

        existing.Lang = newLang;
        existing.Category = newCategory;
        existing.Question = req.Question.Trim();
        existing.Answer = req.Answer.Trim();
        existing.IsPublished = req.IsPublished ?? existing.IsPublished;
        existing.SortOrder = newSortOrder;
        existing.UpdatedAt = DateTime.UtcNow;

        await _faq.UpdateAsync(existing, ct);
        return Ok(existing);
    }

    /// <summary>
    /// ADMIN: borrar pregunta.
    /// DELETE /api/landing/faq/{id}
    /// </summary>
    [HttpDelete("faq/{id:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> DeleteFaq(Guid id, CancellationToken ct)
    {
        await _faq.DeleteAsync(id, ct);
        return Ok(new { deleted = true });
    }

    /// <summary>
    /// ADMIN: reordenar preguntas (drag & drop).
    /// El frontend envía una lista de IDs en el orden nuevo y el backend
    /// reescribe SortOrder en bloque. Normalmente se envía solo el contenido
    /// de UNA categoría (todas las preguntas de "Pasajeros" reordenadas).
    /// PUT /api/landing/faq/reorder
    /// Body: { "ids": ["guid1", "guid2", "guid3"] }
    /// </summary>
    [HttpPut("faq/reorder")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> ReorderFaq(
        [FromBody] ReorderRequest req, CancellationToken ct)
    {
        if(req.Ids is null || req.Ids.Count == 0)
            return BadRequest(new { error = "La lista de IDs no puede estar vacía." });

        await _faq.ReorderAsync(req.Ids, ct);
        return Ok(new { reordered = req.Ids.Count });
    }
}

public record FaqRequest(string Category, string Question, string Answer,
                        string? Lang = null, bool? IsPublished = null);
public record ReorderRequest(List<Guid> Ids);

public record UpdateSectionRequest(string SectionKey, string Lang, string ContentJson);
public record ContactRequest(string Name, string Email, string Subject, string Message);
public record UpdateSettingRequest(string Value);
public record NewsRequest(string Slug, string Tag, string Title, string Summary, string Lang, bool? IsPublished = null);
