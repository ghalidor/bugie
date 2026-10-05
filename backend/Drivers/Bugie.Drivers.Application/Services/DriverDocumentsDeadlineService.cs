using Bugie.Drivers.Application.Email;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Services;

/// <summary>
/// Reglas del plazo de documentos (aprobación por excepción):
/// - qué documentos obligatorios le faltan a un conductor,
/// - cerrar el plazo cuando completa (auditoría "completó documentos"),
/// - desactivar a los que no completaron a tiempo (falta + auditoría + correo).
/// Lo usan ApproveDriverHandler, DocumentsController y el BackgroundService.
/// </summary>
public class DriverDocumentsDeadlineService
{
    private readonly IDriverRepository _drivers;
    private readonly IDocumentRepository _docs;
    private readonly IVehicleRepository _vehicles;
    private readonly IApprovalAuditRepository _audit;
    private readonly IAuthClient _authClient;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;

    public DriverDocumentsDeadlineService(
        IDriverRepository drivers,
        IDocumentRepository docs,
        IVehicleRepository vehicles,
        IApprovalAuditRepository audit,
        IAuthClient authClient,
        IEmailService email,
        ILandingSettingsClient settings)
    {
        _drivers = drivers;
        _docs = docs;
        _vehicles = vehicles;
        _audit = audit;
        _authClient = authClient;
        _email = email;
        _settings = settings;
    }

    /// <summary>
    /// Tipos de documento obligatorios que faltan (no subidos o no aprobados)
    /// y "profile_photo" si no tiene foto de perfil.
    /// </summary>
    public async Task<List<string>> GetMissingAsync(Guid driverId, CancellationToken ct = default)
    {
        var docs = await _docs.GetActiveByDriverAsync(driverId, ct);
        var vehicle = await _vehicles.GetActiveByDriverAsync(driverId, ct);
        var driver = await _drivers.GetByIdAsync(driverId, ct);
        return RequiredDocuments.GetMissing(docs, vehicle, driver?.ProfilePhotoUrl);
    }

    /// <summary>
    /// Si el conductor tiene plazo y ya completó sus documentos, borra el plazo
    /// y lo registra en la auditoría. Devuelve true si se cerró.
    /// </summary>
    public async Task<bool> CloseDeadlineIfCompleteAsync(Driver d, CancellationToken ct = default)
    {
        if(d.DocumentsDeadline is null) return false;

        var missing = await GetMissingAsync(d.Id, ct);
        if(missing.Count > 0) return false;

        var deadline = d.DocumentsDeadline;
        d.ClearDocumentsDeadline();
        await _drivers.UpdateAsync(d, ct);
        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, ApprovalAudit.ActionDocumentsCompleted, null, null,
            "Completó documentos", null, deadline), ct);
        return true;
    }

    /// <summary>
    /// Desactiva a los conductores cuyo plazo venció sin completar documentos.
    /// Devuelve cuántos se desactivaron.
    /// </summary>
    public async Task<int> DeactivateExpiredAsync(CancellationToken ct = default)
    {
        var expired = await _drivers.GetWithExpiredDeadlineAsync(DateTime.UtcNow, ct);
        var count = 0;

        foreach(var d in expired)
        {
            // Pudo completar justo antes y el plazo no se cerró: se cierra aquí.
            if(await CloseDeadlineIfCompleteAsync(d, ct)) continue;

            var missing = await GetMissingAsync(d.Id, ct);
            var deadline = d.DocumentsDeadline;

            d.DeactivateForMissingDocuments();
            await _drivers.UpdateAsync(d, ct);
            await _audit.AddAsync(ApprovalAudit.Create(
                d.Id, ApprovalAudit.ActionAutoDeactivated, null, null,
                "Desactivado automáticamente por no completar documentos", missing, deadline,
                (int)Domain.Enums.DriverStatus.Approved, (int)d.Status), ct);

            await SendEmailAsync(d.UserId,
                "Tu cuenta de conductor de Bugie fue desactivada",
                (name, city) => DriverEmailTemplates.DriverDeactivatedMissingDocs(
                    name, missing.Select(RequiredDocuments.Label).ToList(), city),
                ct);
            count++;
        }
        return count;
    }

    /// <summary>
    /// Envía un correo al conductor (email desde Auth, ciudad desde Landing).
    /// Si falla, no rompe el flujo: solo no llega el correo.
    /// </summary>
    public async Task SendEmailAsync(
        Guid userId, string subject, Func<string, string, string> buildHtml, CancellationToken ct = default)
    {
        try
        {
            var users = await _authClient.GetUsersByIdsAsync(new[] { userId }, ct);
            if(!users.TryGetValue(userId, out var user)) return;

            var city = await _settings.GetDefaultCityAsync(ct);
            await _email.SendAsync(user.Email, user.FullName, subject, buildHtml(user.FullName, city), ct);
        }
        catch
        {
            // Silencioso: el correo no debe romper la aprobación ni el job
        }
    }
}
