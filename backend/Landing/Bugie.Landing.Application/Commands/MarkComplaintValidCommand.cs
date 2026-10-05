using MediatR;
using Microsoft.Extensions.Logging;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Email;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

/// <summary>
/// El admin revisa una hoja marcada como posible bot y confirma que es real:
/// se quita la marca, la fecha limite se calcula desde hoy y recien entonces
/// se envia el correo de confirmacion al consumidor. Guarda el plazo vigente.
/// </summary>
public record MarkComplaintValidCommand(Guid Id) : IRequest<ComplaintAdminDto>;

public class MarkComplaintValidHandler : IRequestHandler<MarkComplaintValidCommand, ComplaintAdminDto>
{
    private readonly IComplaintRepository _repo;
    private readonly ISettingsRepository _settings;
    private readonly IHolidayRepository _holidays;
    private readonly IEmailService _email;
    private readonly IFileStorage _files;
    private readonly LandingLinks _links;
    private readonly ILogger<MarkComplaintValidHandler> _log;

    public MarkComplaintValidHandler(IComplaintRepository repo, ISettingsRepository settings, IHolidayRepository holidays,
        IEmailService email, IFileStorage files, LandingLinks links, ILogger<MarkComplaintValidHandler> log)
        => (_repo, _settings, _holidays, _email, _files, _links, _log)
         = (repo, settings, holidays, email, files, links, log);

    public async Task<ComplaintAdminDto> Handle(MarkComplaintValidCommand cmd, CancellationToken ct)
    {
        var c = await _repo.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Reclamación no encontrada.");
        if(!c.IsBot || c.Status != "pendiente")
            throw new InvalidOperationException("Esta hoja no está marcada como posible bot.");

        var policy = await ComplaintPolicy.LoadAsync(_settings, _holidays, ct);
        var today = BugieTime.Today;
        var due = policy.DueDateFrom(today).ToString("yyyy-MM-dd");
        if(!await _repo.MarkValidAsync(c.Id, due, policy.ResponseDays, ct))
            throw new InvalidOperationException("Esta hoja no está marcada como posible bot.");

        c.IsBot = false;
        c.BotReason = null;
        c.DueDate = due;
        c.ResponseDays = policy.ResponseDays;

        try
        {
            var company = await CompanyInfo.LoadAsync(_settings, ct);
            var link = _links.ComplaintUrl(c.Code, c.AccessToken);
            var html = ComplaintEmailTemplates.Confirmation(c, company, _files.ToAbsoluteUrl(company.LogoUrl), link);
            await _email.SendAsync(c.Email, c.ConsumerName, ComplaintEmailTemplates.ConfirmationSubject(c), html, ct);
            await _repo.SetConfirmationEmailSentAsync(c.Id, ct);
            c.ConfirmationEmailSent = true;
        }
        catch(Exception ex)
        {
            // La hoja ya quedo valida; el admin ve que la copia no salio.
            _log.LogError(ex, "No se pudo enviar la confirmacion de {Code} a {Email}", c.Code, c.Email);
        }

        return ComplaintAdminDto.From(c, today, policy.Calendar);
    }
}
