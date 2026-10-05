using MediatR;
using Bugie.Auth.Application.Common;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Application.Email;
using Bugie.Auth.Domain.Common;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

// =====================================================================
// Cuenta del usuario: completar perfil, documento, contraseña, eliminar.
// Admin: corregir documento / nombres, restaurar y ver la auditoría.
// Errores: InvalidOperationException = 400, ConflictException = 409,
// KeyNotFoundException = 404 (ver ExceptionMiddleware).
// =====================================================================

// ── Usuario: completar documento + nombres (una sola vez) ───────────────
public record CompleteProfileCommand(Guid UserId, string? DocType, string? DocNumber,
    string? FirstNames, string? LastNamePaternal, string? LastNameMaternal) : IRequest<UserProfileDto>;

public class CompleteProfileHandler : IRequestHandler<CompleteProfileCommand, UserProfileDto>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public CompleteProfileHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public async Task<UserProfileDto> Handle(CompleteProfileCommand cmd, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(!user.NeedsProfileCompletion)
            throw new ConflictException("Tus datos ya están completos. Si necesitas corregirlos, contacta a soporte.");

        var (first, paternal, maternal) = IdentityRules.NormalizeNames(
            cmd.FirstNames, cmd.LastNamePaternal, cmd.LastNameMaternal);

        var oldValue = $"{IdentityRules.DocumentText(user.DocType, user.DocNumber)} | " +
                       IdentityRules.NamesText(user.FirstNames, user.LastNamePaternal, user.LastNameMaternal);

        if(string.IsNullOrWhiteSpace(user.DocNumber))
        {
            var (docType, docNumber) = IdentityRules.NormalizeDocument(cmd.DocType, cmd.DocNumber);
            await IdentityRules.EnsureDocumentFreeAsync(_users, docType, docNumber, user.Id, ct);
            user.SetDocument(docType, docNumber);
            await _users.UpdateDocumentAsync(user.Id, docType, docNumber, ct);
        }
        else if(!string.IsNullOrWhiteSpace(cmd.DocNumber))
        {
            // Ya tenía documento: solo se acepta si es el mismo.
            var (docType, docNumber) = IdentityRules.NormalizeDocument(cmd.DocType, cmd.DocNumber);
            if(docType != user.DocType || docNumber != user.DocNumber)
                throw new ConflictException(MyDocumentMessages.AlreadySet);
        }

        user.SetNames(first, paternal, maternal);
        await _users.UpdateNamesAsync(user, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionProfileCompleted,
            user.Id, user.FullName, UserAccountAudit.RoleUser, null, oldValue,
            $"{IdentityRules.DocumentText(user.DocType, user.DocNumber)} | " +
            IdentityRules.NamesText(user.FirstNames, user.LastNamePaternal, user.LastNameMaternal)), ct);

        return UserProfileDto.From(user);
    }
}

// ── Usuario: registrar su documento (una sola vez) ──────────────────────
public record SetMyDocumentCommand(Guid UserId, string? DocType, string? DocNumber) : IRequest<UserProfileDto>;

public static class MyDocumentMessages
{
    public const string AlreadySet = "Tu documento ya fue registrado. Si necesitas corregirlo, contacta a soporte.";
}

public class SetMyDocumentHandler : IRequestHandler<SetMyDocumentCommand, UserProfileDto>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public SetMyDocumentHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public async Task<UserProfileDto> Handle(SetMyDocumentCommand cmd, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(!string.IsNullOrWhiteSpace(user.DocNumber))
            throw new ConflictException(MyDocumentMessages.AlreadySet);

        var (docType, docNumber) = IdentityRules.NormalizeDocument(cmd.DocType, cmd.DocNumber);
        await IdentityRules.EnsureDocumentFreeAsync(_users, docType, docNumber, user.Id, ct);

        user.SetDocument(docType, docNumber);
        await _users.UpdateDocumentAsync(user.Id, docType, docNumber, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionProfileCompleted,
            user.Id, user.FullName, UserAccountAudit.RoleUser, null,
            IdentityRules.DocumentText(null, null), IdentityRules.DocumentText(docType, docNumber)), ct);

        return UserProfileDto.From(user);
    }
}

// ── Usuario: cambiar contraseña ─────────────────────────────────────────
/// <summary>Devuelve un JWT nuevo: el cambio cierra TODAS las sesiones (sello nuevo) y la actual sigue con este token.</summary>
public record ChangePasswordCommand(Guid UserId, string? CurrentPassword, string? NewPassword) : IRequest<string>;

public class ChangePasswordHandler : IRequestHandler<ChangePasswordCommand, string>
{
    private readonly IUserRepository _users;
    private readonly IPasswordHasher _hasher;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;
    private readonly ITokenService _tokens;

    public ChangePasswordHandler(IUserRepository users, IPasswordHasher hasher,
        IEmailService email, ILandingSettingsClient settings, ITokenService tokens)
        => (_users, _hasher, _email, _settings, _tokens) = (users, hasher, email, settings, tokens);

    public async Task<string> Handle(ChangePasswordCommand cmd, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(string.IsNullOrEmpty(cmd.CurrentPassword) || !_hasher.Verify(cmd.CurrentPassword, user.PasswordHash))
            throw new InvalidOperationException("La contraseña actual no es correcta.");

        IdentityRules.ValidatePassword(cmd.NewPassword);
        if(cmd.NewPassword == cmd.CurrentPassword)
            throw new InvalidOperationException("La nueva contraseña debe ser distinta de la actual.");

        await _users.UpdatePasswordHashAsync(user.Id, _hasher.Hash(cmd.NewPassword!), ct);
        // Sello nuevo: se cierran todas las sesiones (otros dispositivos incluidos).
        await _users.RotateSecurityStampAsync(user.Id, ct);
        var fresh = await _users.GetByIdAsync(user.Id, ct) ?? user;

        try
        {
            var city = await _settings.GetDefaultCityAsync(ct);
            await _email.SendAsync(
                toEmail: user.Email,
                toName: user.FullName,
                subject: "Bugie · Tu contraseña fue cambiada",
                htmlBody: EmailTemplates.PasswordChanged(user.FullName, city),
                ct);
        }
        catch
        {
            // El correo no debe dejar al usuario sin el token nuevo (la contraseña ya cambió).
        }

        // Token nuevo para la sesion actual (lleva el sello nuevo).
        return _tokens.GenerateToken(fresh);
    }
}

// ── Usuario: eliminar su cuenta (pasajero / conductor) ──────────────────
public record DeleteAccountCommand(Guid UserId, string? Password, string? Reason) : IRequest<bool>;

public class DeleteAccountHandler : IRequestHandler<DeleteAccountCommand, bool>
{
    public const int ReasonMax = 500;

    private readonly IUserRepository _users;
    private readonly IPasswordHasher _hasher;
    private readonly IAccountActivityReader _activity;
    private readonly IUserFcmTokenRepository _fcm;
    private readonly IDriversClient _drivers;
    private readonly IUserAccountAuditRepository _audit;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;

    public DeleteAccountHandler(IUserRepository users, IPasswordHasher hasher, IAccountActivityReader activity,
        IUserFcmTokenRepository fcm, IDriversClient drivers, IUserAccountAuditRepository audit,
        IEmailService email, ILandingSettingsClient settings)
    {
        _users = users;
        _hasher = hasher;
        _activity = activity;
        _fcm = fcm;
        _drivers = drivers;
        _audit = audit;
        _email = email;
        _settings = settings;
    }

    public async Task<bool> Handle(DeleteAccountCommand cmd, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(user.IsDeleted)
            throw new UnauthorizedAccessException(AccountMessages.Deleted);

        if(user.Role is not ("passenger" or "driver"))
            throw new InvalidOperationException("Solo las cuentas de pasajero o conductor se pueden eliminar desde la app.");

        if(string.IsNullOrEmpty(cmd.Password) || !_hasher.Verify(cmd.Password, user.PasswordHash))
            throw new InvalidOperationException("La contraseña no es correcta.");

        var reason = string.IsNullOrWhiteSpace(cmd.Reason) ? null : cmd.Reason.Trim();
        if(reason is not null && reason.Length > ReasonMax)
            throw new InvalidOperationException($"El motivo no puede superar {ReasonMax} caracteres.");

        // 1) Viaje o envío sin terminar (como pasajero o conductor)
        var trip = await _activity.GetOpenTripAsync(user.Id, ct);
        if(trip is not null)
        {
            var what = trip.ServiceType == 1 ? "envío" : "viaje";
            throw new ConflictException(trip.Status switch
            {
                3 or 6 => $"Tienes un {what} en curso. Termínalo antes de eliminar tu cuenta.",
                _ when trip.ScheduledAt.HasValue =>
                    $"Tienes un {what} programado pendiente. Cancélalo antes de eliminar tu cuenta.",
                _ => $"Tienes un {what} activo (buscando conductor o aceptado). Termínalo o cancélalo antes de eliminar tu cuenta.",
            });
        }

        // 2) Conductor con comisiones pendientes con Bugie
        if(user.Role == "driver")
        {
            var debt = await _activity.GetDriverPendingCommissionAsync(user.Id, ct);
            if(debt > 0)
                throw new ConflictException(
                    $"Tienes comisiones pendientes con Bugie por S/ {debt.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}. " +
                    "Págalas antes de eliminar tu cuenta.");

            // 3) Sacarlo de línea y cerrar su check-in ANTES de marcarla eliminada,
            //    para no dejar un conductor eliminado visible en el mapa.
            if(!await _drivers.NotifyAccountDeletedAsync(user.Id, ct))
                throw new InvalidOperationException("No pudimos eliminar tu cuenta en este momento. Intenta de nuevo en unos minutos.");
        }

        // 4) Estado "Eliminada" (no se borra nada)
        user.MarkDeleted(reason);
        await _users.UpdateDeletionAsync(user, ct);
        // Sello nuevo: el JWT de la cuenta eliminada deja de valer en las 6 APIs.
        await _users.RotateSecurityStampAsync(user.Id, ct);

        // 5) Sin notificaciones push desde ahora
        await _fcm.DeleteByUserIdAsync(user.Id, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionDeleted,
            user.Id, user.FullName, UserAccountAudit.RoleUser, reason), ct);

        try
        {
            var city = await _settings.GetDefaultCityAsync(ct);
            await _email.SendAsync(user.Email, user.FullName, "Bugie · Tu cuenta fue eliminada",
                EmailTemplates.AccountDeleted(user.FullName, city), ct);
        }
        catch
        {
            // El correo no debe revertir la eliminación.
        }

        return true;
    }
}

// ── Admin: corregir documento (motivo obligatorio, auditado) ────────────
public record AdminUpdateDocumentCommand(Guid AdminUserId, string? AdminName, Guid UserId,
    string? DocType, string? DocNumber, string? Reason) : IRequest<UserProfileDto>;

public class AdminUpdateDocumentHandler : IRequestHandler<AdminUpdateDocumentCommand, UserProfileDto>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public AdminUpdateDocumentHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public async Task<UserProfileDto> Handle(AdminUpdateDocumentCommand cmd, CancellationToken ct)
    {
        var reason = IdentityRules.ValidateReason(cmd.Reason);
        var (docType, docNumber) = IdentityRules.NormalizeDocument(cmd.DocType, cmd.DocNumber);

        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(user.DocType == docType && user.DocNumber == docNumber)
            throw new InvalidOperationException("El documento es el mismo que ya tiene la cuenta.");

        // Si la cuenta está eliminada, el índice único no la cuenta: igual se valida
        // contra las cuentas activas para que una restauración posterior no choque.
        await IdentityRules.EnsureDocumentFreeAsync(_users, docType, docNumber, user.Id, ct);

        var oldValue = IdentityRules.DocumentText(user.DocType, user.DocNumber);
        user.SetDocument(docType, docNumber);
        await _users.UpdateDocumentAsync(user.Id, docType, docNumber, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionDocumentChanged,
            cmd.AdminUserId, cmd.AdminName, UserAccountAudit.RoleAdmin, reason,
            oldValue, IdentityRules.DocumentText(docType, docNumber)), ct);

        return UserProfileDto.From(user);
    }
}

// ── Admin: corregir nombres (motivo obligatorio, auditado) ──────────────
public record AdminUpdateNamesCommand(Guid AdminUserId, string? AdminName, Guid UserId,
    string? FirstNames, string? LastNamePaternal, string? LastNameMaternal, string? Reason) : IRequest<UserProfileDto>;

public class AdminUpdateNamesHandler : IRequestHandler<AdminUpdateNamesCommand, UserProfileDto>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public AdminUpdateNamesHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public async Task<UserProfileDto> Handle(AdminUpdateNamesCommand cmd, CancellationToken ct)
    {
        var reason = IdentityRules.ValidateReason(cmd.Reason);
        var (first, paternal, maternal) = IdentityRules.NormalizeNames(
            cmd.FirstNames, cmd.LastNamePaternal, cmd.LastNameMaternal);

        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        var oldValue = IdentityRules.NamesText(user.FirstNames, user.LastNamePaternal, user.LastNameMaternal);
        user.SetNames(first, paternal, maternal);
        var newValue = IdentityRules.NamesText(user.FirstNames, user.LastNamePaternal, user.LastNameMaternal);
        if(oldValue == newValue)
            throw new InvalidOperationException("Los nombres son los mismos que ya tiene la cuenta.");

        await _users.UpdateNamesAsync(user, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionNamesChanged,
            cmd.AdminUserId, cmd.AdminName, UserAccountAudit.RoleAdmin, reason, oldValue, newValue), ct);

        return UserProfileDto.From(user);
    }
}

// ── Admin: restaurar una cuenta eliminada ───────────────────────────────
public record RestoreUserCommand(Guid AdminUserId, string? AdminName, Guid UserId, string? Reason)
    : IRequest<UserProfileDto>;

public class RestoreUserHandler : IRequestHandler<RestoreUserCommand, UserProfileDto>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;

    public RestoreUserHandler(IUserRepository users, IUserAccountAuditRepository audit,
        IEmailService email, ILandingSettingsClient settings)
        => (_users, _audit, _email, _settings) = (users, audit, email, settings);

    public async Task<UserProfileDto> Handle(RestoreUserCommand cmd, CancellationToken ct)
    {
        var reason = IdentityRules.ValidateReason(cmd.Reason);

        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(!user.IsDeleted)
            throw new ConflictException("La cuenta no está eliminada.");

        // Mientras estuvo eliminada, otra persona pudo registrarse con su documento.
        if(!string.IsNullOrWhiteSpace(user.DocNumber))
        {
            var other = await _users.GetActiveByDocumentAsync(user.DocType!, user.DocNumber, user.Id, ct);
            if(other is not null)
                throw new ConflictException(
                    $"No se puede restaurar: ya existe otra cuenta activa con el mismo documento ({other.Email}).");
        }

        var deletedAt = user.DeletedAt;
        user.Restore();
        await _users.UpdateDeletionAsync(user, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionRestored,
            cmd.AdminUserId, cmd.AdminName, UserAccountAudit.RoleAdmin, reason,
            deletedAt is null ? null : $"Eliminada el {BugieTime.ToPeru(deletedAt.Value):dd/MM/yyyy HH:mm}", "Activa"), ct);

        try
        {
            var city = await _settings.GetDefaultCityAsync(ct);
            await _email.SendAsync(user.Email, user.FullName, "Bugie · Tu cuenta fue restaurada",
                EmailTemplates.AccountRestored(user.FullName, city), ct);
        }
        catch
        {
            // El correo no debe revertir la restauración.
        }

        return UserProfileDto.From(user);
    }
}

// ── Admin: auditoría de la cuenta ───────────────────────────────────────
public record UserAccountAuditDto(
    Guid Id, string Action, string ActionLabel, Guid? ActorUserId, string? ActorName, string ActorRole,
    string? Reason, string? OldValue, string? NewValue, DateTime CreatedAt);

public record GetUserAccountAuditQuery(Guid UserId) : IRequest<List<UserAccountAuditDto>>;

public class GetUserAccountAuditHandler : IRequestHandler<GetUserAccountAuditQuery, List<UserAccountAuditDto>>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public GetUserAccountAuditHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public static string Label(string action) => action switch
    {
        UserAccountAudit.ActionDeleted => "Cuenta eliminada",
        UserAccountAudit.ActionRestored => "Cuenta restaurada",
        UserAccountAudit.ActionDocumentChanged => "Documento corregido",
        UserAccountAudit.ActionNamesChanged => "Nombres corregidos",
        UserAccountAudit.ActionProfileCompleted => "Datos completados por el usuario",
        UserAccountAudit.ActionDeactivated => "Cuenta desactivada",
        UserAccountAudit.ActionReactivated => "Cuenta reactivada",
        UserAccountAudit.ActionSessionsRevoked => "Sesiones cerradas por el admin",
        _ => action,
    };

    public async Task<List<UserAccountAuditDto>> Handle(GetUserAccountAuditQuery q, CancellationToken ct)
    {
        _ = await _users.GetByIdAsync(q.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        var rows = await _audit.GetByUserAsync(q.UserId, ct);
        return rows.Select(a => new UserAccountAuditDto(
            a.Id, a.Action, Label(a.Action), a.ActorUserId, a.ActorName, a.ActorRole,
            a.Reason, a.OldValue, a.NewValue, a.CreatedAt)).ToList();
    }
}
