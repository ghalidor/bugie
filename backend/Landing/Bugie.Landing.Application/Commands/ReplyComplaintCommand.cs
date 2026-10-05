using MediatR;
using Microsoft.Extensions.Logging;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Email;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

/// <summary>
/// El admin responde una hoja: se guarda la respuesta (queda 'respondida',
/// cerrada) y se envia por correo al consumidor con el enlace de consulta.
/// </summary>
public record ReplyComplaintCommand(Guid Id, string? Response, Guid AdminId, string AdminName)
    : IRequest<ComplaintAdminDto>;

public class ReplyComplaintHandler : IRequestHandler<ReplyComplaintCommand, ComplaintAdminDto>
{
    private readonly IComplaintRepository _repo;
    private readonly ISettingsRepository _settings;
    private readonly IHolidayRepository _holidays;
    private readonly IEmailService _email;
    private readonly IFileStorage _files;
    private readonly LandingLinks _links;
    private readonly ILogger<ReplyComplaintHandler> _log;

    public ReplyComplaintHandler(IComplaintRepository repo, ISettingsRepository settings, IHolidayRepository holidays,
        IEmailService email, IFileStorage files, LandingLinks links, ILogger<ReplyComplaintHandler> log)
        => (_repo, _settings, _holidays, _email, _files, _links, _log) = (repo, settings, holidays, email, files, links, log);

    public async Task<ComplaintAdminDto> Handle(ReplyComplaintCommand cmd, CancellationToken ct)
    {
        var text = (cmd.Response ?? "").Trim();
        if(text.Length == 0) throw new ArgumentException("Escribe la respuesta.");
        if(text.Length > 4000) throw new ArgumentException("La respuesta admite como máximo 4000 caracteres.");

        var c = await _repo.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Reclamación no encontrada.");
        if(c.Status == "descartada")
            throw new InvalidOperationException("Esta reclamación fue descartada.");
        if(c.Status == "anulada")
            throw new InvalidOperationException("Esta reclamación fue anulada.");
        if(c.Status != "pendiente")
            throw new InvalidOperationException("Esta reclamación ya fue respondida.");
        if(c.IsBot)
            throw new InvalidOperationException("Primero marca la hoja como válida: está marcada como posible bot.");

        var now = DateTime.UtcNow;
        if(!await _repo.SaveResponseAsync(c.Id, text, cmd.AdminId, cmd.AdminName, now, ct))
            throw new InvalidOperationException("Esta reclamación ya fue respondida.");

        c.Status = "respondida";
        c.Response = text;
        c.RespondedAt = now;
        c.RespondedBy = cmd.AdminId;
        c.RespondedByName = cmd.AdminName;

        try
        {
            var company = await CompanyInfo.LoadAsync(_settings, ct);
            var link = _links.ComplaintUrl(c.Code, c.AccessToken);
            var html = ComplaintEmailTemplates.Response(c, company, _files.ToAbsoluteUrl(company.LogoUrl), link);
            await _email.SendAsync(c.Email, c.ConsumerName, ComplaintEmailTemplates.ResponseSubject(c), html, ct);
            await _repo.SetResponseEmailSentAsync(c.Id, ct);
            c.ResponseEmailSent = true;
        }
        catch(Exception ex)
        {
            // La respuesta queda guardada; el admin ve que el correo no salio.
            _log.LogError(ex, "No se pudo enviar la respuesta de {Code} a {Email}", c.Code, c.Email);
        }

        var policy = await ComplaintPolicy.LoadAsync(_settings, _holidays, ct);
        return ComplaintAdminDto.From(c, BugieTime.Today, policy.Calendar);
    }
}
