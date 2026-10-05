using MediatR;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public enum ComplaintCloseAction
{
    /// <summary>Anular: cualquier hoja pendiente (incluido posible bot).</summary>
    Void,
    /// <summary>Descartar: solo un posible bot pendiente.</summary>
    Discard,
}

/// <summary>
/// El admin cierra una hoja sin responderla: la anula o la descarta (posible bot).
/// El motivo es obligatorio y queda guardado con quien y cuando. No se envia
/// ningun correo ni aviso al consumidor y nada se borra. Una hoja respondida
/// no se puede anular.
/// </summary>
public record CloseComplaintCommand(Guid Id, ComplaintCloseAction Action, string? Reason, Guid AdminId, string AdminName)
    : IRequest<ComplaintAdminDto>;

public class CloseComplaintHandler : IRequestHandler<CloseComplaintCommand, ComplaintAdminDto>
{
    public const int MinReason = 10;
    public const int MaxReason = 500;

    private readonly IComplaintRepository _repo;
    private readonly ISettingsRepository _settings;
    private readonly IHolidayRepository _holidays;

    public CloseComplaintHandler(IComplaintRepository repo, ISettingsRepository settings, IHolidayRepository holidays)
        => (_repo, _settings, _holidays) = (repo, settings, holidays);

    public async Task<ComplaintAdminDto> Handle(CloseComplaintCommand cmd, CancellationToken ct)
    {
        var discard = cmd.Action == ComplaintCloseAction.Discard;
        var verb = discard ? "descartar" : "anular";

        var reason = (cmd.Reason ?? "").Trim();
        if(reason.Length < MinReason)
            throw new ArgumentException($"Escribe el motivo para {verb} (mínimo {MinReason} caracteres).");
        if(reason.Length > MaxReason)
            throw new ArgumentException($"El motivo admite como máximo {MaxReason} caracteres.");

        var c = await _repo.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Reclamación no encontrada.");
        switch(c.Status)
        {
            case "respondida": throw new InvalidOperationException($"Esta reclamación ya fue respondida: no se puede {verb}.");
            case "anulada":    throw new InvalidOperationException("Esta reclamación ya fue anulada.");
            case "descartada": throw new InvalidOperationException("Esta reclamación ya fue descartada.");
        }
        if(discard && !c.IsBot)
            throw new InvalidOperationException("Solo se descartan hojas marcadas como posible bot. Si quieres cerrarla, anúlala.");

        var now = DateTime.UtcNow;
        var ok = discard
            ? await _repo.DiscardBotAsync(c.Id, reason, cmd.AdminId, cmd.AdminName, now, ct)
            : await _repo.VoidAsync(c.Id, reason, cmd.AdminId, cmd.AdminName, now, ct);
        if(!ok)
            throw new InvalidOperationException("La hoja cambió de estado. Actualiza la lista e inténtalo de nuevo.");

        c.Status = discard ? "descartada" : "anulada";
        c.ClosedReason = reason;
        c.ClosedAt = now;
        c.ClosedBy = cmd.AdminId;
        c.ClosedByName = cmd.AdminName;

        var policy = await ComplaintPolicy.LoadAsync(_settings, _holidays, ct);
        return ComplaintAdminDto.From(c, BugieTime.Today, policy.Calendar);
    }
}
