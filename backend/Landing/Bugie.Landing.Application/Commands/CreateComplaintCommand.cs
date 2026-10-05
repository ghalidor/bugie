using System.Net.Mail;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using MediatR;
using Microsoft.Extensions.Logging;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Email;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

/// <summary>
/// Registra una hoja del Libro de Reclamaciones (formulario publico).
/// Website es el campo trampa (invisible para personas): si llega lleno, la
/// hoja se guarda como posible bot, sin correos ni aviso al admin, y la
/// respuesta es igual a la de un registro normal.
/// </summary>
public record CreateComplaintCommand(
    string? ConsumerName, string? ConsumerAddress, string? DocType, string? DocNumber,
    string? Phone, string? Email, string? EmailConfirm, string? GuardianName,
    string? GoodType, decimal? ClaimedAmount, string? GoodDescription,
    string? ComplaintType, Guid? TripId, string? TripCode, string? Reference,
    string? Detail, string? Request,
    Guid? UserId, string? Website = null) : IRequest<CreateComplaintResult>;

public class CreateComplaintHandler : IRequestHandler<CreateComplaintCommand, CreateComplaintResult>
{
    private readonly IComplaintRepository _repo;
    private readonly ISettingsRepository _settings;
    private readonly IHolidayRepository _holidays;
    private readonly IEmailService _email;
    private readonly IFileStorage _files;
    private readonly IAdminEventsPublisher _events;
    private readonly LandingLinks _links;
    private readonly ILogger<CreateComplaintHandler> _log;

    public CreateComplaintHandler(IComplaintRepository repo, ISettingsRepository settings,
        IHolidayRepository holidays, IEmailService email, IFileStorage files, IAdminEventsPublisher events,
        LandingLinks links, ILogger<CreateComplaintHandler> log)
        => (_repo, _settings, _holidays, _email, _files, _events, _links, _log)
         = (repo, settings, holidays, email, files, events, links, log);

    public async Task<CreateComplaintResult> Handle(CreateComplaintCommand cmd, CancellationToken ct)
    {
        var c = Validate(cmd);

        // Codigo corto escrito a mano (ej. los primeros caracteres del id que
        // ve el pasajero): se enlaza al viaje solo si coincide con uno solo.
        if(c.TripId is null && !string.IsNullOrWhiteSpace(c.TripCode))
            c.TripId = await _repo.FindTripIdByCodeAsync(c.TripCode, ct);

        // Numero correlativo del anio (hora de Peru) y plazo en dias habiles
        // segun la configuracion vigente. La fecha limite queda guardada.
        var policy = await ComplaintPolicy.LoadAsync(_settings, _holidays, ct);
        var today = BugieTime.Today;
        c.Year = today.Year;
        c.Seq = await _repo.NextSeqAsync(c.Year, ct);
        c.Code = $"LR-{c.Year}-{c.Seq:D6}";
        c.Id = Guid.NewGuid();
        c.CreatedAt = DateTime.UtcNow;
        c.DueDate = policy.DueDateFrom(today).ToString("yyyy-MM-dd");
        c.ResponseDays = policy.ResponseDays;
        c.Status = "pendiente";
        c.AccessToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        c.UserId = cmd.UserId;
        if(!string.IsNullOrWhiteSpace(cmd.Website))
        {
            c.IsBot = true;
            c.BotReason = "Llenó el campo oculto del formulario (campo trampa).";
        }

        await _repo.AddAsync(c, ct);

        // Posible bot: sin correos ni aviso. Se responde como un registro normal.
        if(c.IsBot)
        {
            _log.LogWarning("Hoja {Code} marcada como posible bot (campo trampa lleno)", c.Code);
            return new CreateComplaintResult(c.Code, c.AccessToken, c.CreatedAt, c.DueDate, true);
        }

        // Correo de confirmacion con copia de la hoja. Si falla, la hoja ya
        // quedo registrada: se informa en la respuesta (emailSent = false).
        var emailSent = false;
        try
        {
            var company = await CompanyInfo.LoadAsync(_settings, ct);
            var link = _links.ComplaintUrl(c.Code, c.AccessToken);
            var html = ComplaintEmailTemplates.Confirmation(c, company, _files.ToAbsoluteUrl(company.LogoUrl), link);
            await _email.SendAsync(c.Email, c.ConsumerName, ComplaintEmailTemplates.ConfirmationSubject(c), html, ct);
            await _repo.SetConfirmationEmailSentAsync(c.Id, ct);
            emailSent = true;
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "No se pudo enviar la confirmacion de {Code} a {Email}", c.Code, c.Email);
        }

        // Aviso al centro de avisos del admin (no bloquea ni falla).
        _events.Publish(
            type: "complaint",
            title: "Nueva reclamación",
            message: $"{c.Code} · {(c.ComplaintType == "queja" ? "Queja" : "Reclamo")}",
            link: "/admin/reclamaciones",
            permission: "view:complaints");

        return new CreateComplaintResult(c.Code, c.AccessToken, c.CreatedAt, c.DueDate, emailSent);
    }

    // ── Validacion completa (el formulario tambien valida, pero no confiamos) ──

    private static readonly Regex DniRx = new(@"^\d{8}$");
    private static readonly Regex CeRx = new(@"^[A-Za-z0-9]{9,12}$");
    private static readonly Regex PhoneRx = new(@"^\+?[\d\s\-]{6,20}$");

    private static Complaint Validate(CreateComplaintCommand cmd)
    {
        static string Req(string? v, string field, int max)
        {
            var s = (v ?? "").Trim();
            if(s.Length == 0) throw new ArgumentException($"El campo {field} es obligatorio.");
            if(s.Length > max) throw new ArgumentException($"El campo {field} admite como máximo {max} caracteres.");
            return s;
        }
        static string? Opt(string? v, string field, int max)
        {
            var s = (v ?? "").Trim();
            if(s.Length == 0) return null;
            if(s.Length > max) throw new ArgumentException($"El campo {field} admite como máximo {max} caracteres.");
            return s;
        }

        var name = Req(cmd.ConsumerName, "nombre completo", 150);
        var address = Req(cmd.ConsumerAddress, "domicilio", 250);

        var docType = (cmd.DocType ?? "").Trim().ToUpperInvariant();
        if(docType is not ("DNI" or "CE"))
            throw new ArgumentException("El tipo de documento debe ser DNI o CE.");
        var docNumber = Req(cmd.DocNumber, "número de documento", 12);
        if(docType == "DNI" && !DniRx.IsMatch(docNumber))
            throw new ArgumentException("El DNI debe tener 8 dígitos.");
        if(docType == "CE" && !CeRx.IsMatch(docNumber))
            throw new ArgumentException("El carné de extranjería debe tener entre 9 y 12 letras o números.");

        var phone = Req(cmd.Phone, "teléfono", 20);
        if(!PhoneRx.IsMatch(phone))
            throw new ArgumentException("El teléfono no es válido.");

        var email = Req(cmd.Email, "e-mail", 150);
        if(!MailAddress.TryCreate(email, out var parsed) || parsed.Address != email || !email.Contains('.'))
            throw new ArgumentException("El e-mail no es válido.");
        if(!string.Equals(email, (cmd.EmailConfirm ?? "").Trim(), StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Los correos no coinciden.");

        var goodType = (cmd.GoodType ?? "").Trim().ToLowerInvariant();
        if(goodType is not ("producto" or "servicio"))
            throw new ArgumentException("Indica si el bien contratado es un producto o un servicio.");
        if(cmd.ClaimedAmount is < 0 or > 999999)
            throw new ArgumentException("El monto reclamado no es válido.");

        var type = (cmd.ComplaintType ?? "").Trim().ToLowerInvariant();
        if(type is not ("reclamo" or "queja"))
            throw new ArgumentException("Indica si es un reclamo o una queja.");

        var tripCode = Opt(cmd.TripCode, "viaje o envío relacionado", 60);
        var tripId = cmd.TripId;
        // Si escribieron el id completo del viaje, lo enlazamos.
        if(tripId is null && tripCode is not null && Guid.TryParse(tripCode, out var g)) tripId = g;

        return new Complaint
        {
            ConsumerName = name,
            ConsumerAddress = address,
            DocType = docType,
            DocNumber = docNumber.ToUpperInvariant(),
            Phone = phone,
            Email = email,
            GuardianName = Opt(cmd.GuardianName, "padre, madre o apoderado", 150),
            GoodType = goodType,
            ClaimedAmount = cmd.ClaimedAmount is null ? null : Math.Round(cmd.ClaimedAmount.Value, 2),
            GoodDescription = Opt(cmd.GoodDescription, "descripción", 500),
            ComplaintType = type,
            TripId = tripId,
            TripCode = tripCode,
            Reference = Opt(cmd.Reference, "referencia", 200),
            Detail = Req(cmd.Detail, "detalle", 4000),
            Request = Req(cmd.Request, "pedido", 2000),
        };
    }
}
