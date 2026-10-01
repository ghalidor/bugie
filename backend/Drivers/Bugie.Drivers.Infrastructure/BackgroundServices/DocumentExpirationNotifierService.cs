using Bugie.Drivers.Application.Email;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.BackgroundServices;

public class DocumentExpirationOptions
{
    public int NotificationHour { get; set; } = 9;
    public string AdminEmail { get; set; } = string.Empty;
    public string AdminName { get; set; } = "Administrador Bugie";

    /// <summary>
    /// Días antes de la caducidad durante los cuales el conductor PUEDE
    /// renovar/actualizar un documento ya aprobado. Fuera de esta ventana
    /// el documento queda "bloqueado" para edición.
    /// Si el documento todavía no existe, siempre puede subirlo.
    /// Default: 4 días (regla del cliente).
    /// </summary>
    public int RenewalWindowDays { get; set; } = 4;
}

/// <summary>
/// Job que corre 1 vez al día a la hora configurada (hora Perú).
/// Por cada documento que caduca en 6/3/0 días: manda correo a conductor + admin.
/// Si caduca HOY: cambia el status del conductor a ExpiredDocs.
/// Anti-spam vía drivers.DocumentNotifications.
/// </summary>
public class DocumentExpirationNotifierService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly DocumentExpirationOptions _opt;
    private readonly ILogger<DocumentExpirationNotifierService> _log;

    private static readonly TimeSpan PeruOffset = TimeSpan.FromHours(-5);

    public DocumentExpirationNotifierService(
        IServiceProvider services,
        IOptions<DocumentExpirationOptions> opt,
        ILogger<DocumentExpirationNotifierService> log)
    {
        _services = services;
        _opt = opt.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("DocumentExpirationNotifierService iniciado. Hora: {Hour}:00 (Perú)",
                            _opt.NotificationHour);

        while(!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeUntilNextRun();
            _log.LogInformation("Próxima ejecución en {Hours:F1} horas", delay.TotalHours);

            try { await Task.Delay(delay, stoppingToken); }
            catch(TaskCanceledException) { break; }

            try { await RunOnceAsync(stoppingToken); }
            catch(Exception ex) { _log.LogError(ex, "Error en job de caducidad"); }
        }
    }

    private TimeSpan TimeUntilNextRun()
    {
        var nowPeru = DateTime.UtcNow.Add(PeruOffset);
        var nextRunPeru = new DateTime(nowPeru.Year, nowPeru.Month, nowPeru.Day,
                                       _opt.NotificationHour, 0, 0, DateTimeKind.Unspecified);
        if(nextRunPeru <= nowPeru) nextRunPeru = nextRunPeru.AddDays(1);
        return nextRunPeru - nowPeru;
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        _log.LogInformation("Ejecutando job de notificación de caducidad...");

        using var scope = _services.CreateScope();
        var docs = scope.ServiceProvider.GetRequiredService<IDocumentRepository>();
        var driversRepo = scope.ServiceProvider.GetRequiredService<IDriverRepository>();
        var notifs = scope.ServiceProvider.GetRequiredService<IDocumentNotificationRepository>();
        var authClient = scope.ServiceProvider.GetRequiredService<IAuthClient>();
        var landing = scope.ServiceProvider.GetRequiredService<ILandingSettingsClient>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var expiringDocs = await docs.GetExpiringSoonAsync(ct);
        _log.LogInformation("Documentos por caducar: {Count}", expiringDocs.Count);

        if(expiringDocs.Count == 0) return;

        // Cargar una vez la ciudad (cacheada en el cliente)
        var city = await landing.GetDefaultCityAsync(ct);

        var userIds = expiringDocs.Select(d => d.DriverUserId).Distinct().ToList();
        var userMap = await authClient.GetUsersByIdsAsync(userIds, ct);

        var sentCount = 0;
        var skipCount = 0;
        var driverIdsToExpire = new HashSet<Guid>();

        foreach(var doc in expiringDocs)
        {
            if(await notifs.ExistsAsync(doc.DocumentId, doc.DaysUntilExpiry, ct))
            {
                skipCount++;
                if(doc.DaysUntilExpiry == 0) driverIdsToExpire.Add(doc.DriverId);
                continue;
            }

            if(!userMap.TryGetValue(doc.DriverUserId, out var user))
            {
                _log.LogWarning("Sin info de usuario {UserId}", doc.DriverUserId);
                continue;
            }

            // 1. Correo al conductor
            try
            {
                await email.SendAsync(
                    toEmail: user.Email,
                    toName: user.FullName,
                    subject: SubjectFor(doc.DaysUntilExpiry, "driver"),
                    htmlBody: DriverEmailTemplates.DocumentExpiringDriver(
                        user.FullName, doc.DocType, doc.ExpiresAt, doc.DaysUntilExpiry, city),
                    ct);
            }
            catch(Exception ex)
            {
                _log.LogError(ex, "Error enviando correo a conductor {Email}", user.Email);
            }

            // 2. Correo al admin
            if(!string.IsNullOrWhiteSpace(_opt.AdminEmail))
            {
                try
                {
                    await email.SendAsync(
                        toEmail: _opt.AdminEmail,
                        toName: _opt.AdminName,
                        subject: SubjectFor(doc.DaysUntilExpiry, "admin"),
                        htmlBody: DriverEmailTemplates.DocumentExpiringAdmin(
                            user.FullName, user.Email, user.Phone,
                            doc.DocType, doc.ExpiresAt, doc.DaysUntilExpiry, city),
                        ct);
                }
                catch(Exception ex)
                {
                    _log.LogError(ex, "Error enviando correo al admin {Email}", _opt.AdminEmail);
                }
            }

            await notifs.AddAsync(DocumentNotification.Create(doc.DocumentId, doc.DaysUntilExpiry), ct);

            if(doc.DaysUntilExpiry == 0) driverIdsToExpire.Add(doc.DriverId);

            sentCount++;
        }

        // Cambiar status a ExpiredDocs para los del día 0
        var expiredDriversCount = 0;
        foreach(var driverId in driverIdsToExpire)
        {
            var driver = await driversRepo.GetByIdAsync(driverId, ct);
            if(driver is null) continue;

            if(driver.Status == Bugie.Drivers.Domain.Enums.DriverStatus.Approved)
            {
                driver.MarkAsExpired();
                await driversRepo.UpdateAsync(driver, ct);
                expiredDriversCount++;
            }
        }

        _log.LogInformation(
            "Job completado. Enviados: {Sent}, omitidos: {Skipped}, ExpiredDocs: {Expired}",
            sentCount, skipCount, expiredDriversCount);
    }

    private static string SubjectFor(int days, string audience)
    {
        var prefix = audience == "admin" ? "[Admin] " : "";
        return days switch
        {
            0 => $"{prefix}Documento de conductor caducó hoy",
            3 => $"{prefix}Documento de conductor caduca en 3 días",
            _ => $"{prefix}Documento de conductor caduca en 6 días",
        };
    }
}