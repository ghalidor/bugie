using MediatR;
using Bugie.Auth.Application.Common;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Application.Email;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class RegisterUserHandler : IRequestHandler<RegisterUserCommand, AuthResponse>
{
    private readonly IUserRepository _users;
    private readonly ITokenService _tokens;
    private readonly IPasswordHasher _hasher;
    private readonly IEmailService _email;
    private readonly IDriversClient _driversClient;
    private readonly ILandingSettingsClient _settings;
    private readonly IRewardsClient _rewardsClient;

    public RegisterUserHandler(
        IUserRepository users,
        ITokenService tokens,
        IPasswordHasher hasher,
        IEmailService email,
        IDriversClient driversClient,
        ILandingSettingsClient settings,
        IRewardsClient rewardsClient)
    {
        _users = users;
        _tokens = tokens;
        _hasher = hasher;
        _email = email;
        _driversClient = driversClient;
        _settings = settings;
        _rewardsClient = rewardsClient;
    }

    // Roles que se pueden crear por el registro público. Los admin solo se
    // crean desde el panel (AdminSecurityController).
    private static readonly string[] AllowedRoles = ["passenger", "driver"];

    public async Task<AuthResponse> Handle(RegisterUserCommand cmd, CancellationToken ct)
    {
        // El validador FluentValidation no se ejecuta en el pipeline: las reglas
        // de seguridad se aplican aquí de forma explícita.
        var role = (cmd.Role ?? "").Trim().ToLowerInvariant();
        if(!AllowedRoles.Contains(role))
            throw new InvalidOperationException("Rol inválido.");
        cmd = cmd with { Role = role };

        if(string.IsNullOrWhiteSpace(cmd.Email) || string.IsNullOrWhiteSpace(cmd.Password)
            || string.IsNullOrWhiteSpace(cmd.Phone))
            throw new InvalidOperationException("Correo, contraseña y teléfono son obligatorios.");

        // Debe aceptar términos y condiciones (el check del formulario).
        if(!cmd.AcceptedTerms)
            throw new InvalidOperationException("Debe aceptar los términos y condiciones.");

        // Debe firmar (la firma llega como imagen PNG en base64 / data URL).
        if(string.IsNullOrWhiteSpace(cmd.SignatureImage))
            throw new InvalidOperationException("Debe firmar para completar el registro.");

        // Documento y nombres separados: obligatorios (materno opcional).
        var (docType, docNumber) = IdentityRules.NormalizeDocument(cmd.DocType, cmd.DocNumber);
        var (firstNames, paternal, maternal) = IdentityRules.NormalizeNames(
            cmd.FirstNames, cmd.LastNamePaternal, cmd.LastNameMaternal);
        IdentityRules.ValidatePassword(cmd.Password);

        var existing = await _users.GetByEmailAsync(cmd.Email, ct);
        if(existing is not null)
            throw new InvalidOperationException(existing.IsDeleted
                ? "Este correo pertenece a una cuenta eliminada. Si quieres recuperarla, contacta a soporte."
                : "El correo ya está registrado.");

        // Una sola cuenta NO eliminada por documento (409). El documento de
        // una cuenta eliminada sí se puede volver a usar.
        await IdentityRules.EnsureDocumentFreeAsync(_users, docType, docNumber, null, ct);

        // 1. Crear el usuario
        var user = User.Create(cmd.Email, _hasher.Hash(cmd.Password), cmd.Role,
            firstNames, paternal, maternal, cmd.Phone, docType, docNumber,
            termsAccepted: cmd.AcceptedTerms, signatureImage: cmd.SignatureImage);
        await _users.AddAsync(user, ct);

        // 2. Si es conductor, crear perfil en Drivers (con rollback si falla)
        if(user.Role == "driver")
        {
            var ok = await _driversClient.RegisterDriverAsync(user.Id, ct);
            if(!ok)
            {
                await _users.DeleteAsync(user.Id, ct);
                throw new InvalidOperationException(
                    "No se pudo completar el registro del conductor. Intenta de nuevo.");
            }
        }

        // Si vino con codigo de invitacion, avisar a Rewards.
        // Va DESPUES de crear el usuario y sin revertir nada si falla: un
        // referido perdido es una molestia, un registro perdido es un cliente
        // perdido.
        if(!string.IsNullOrWhiteSpace(cmd.ReferralCode))
        {
            await _rewardsClient.RegisterReferralAsync(
                user.Id, user.Role, cmd.ReferralCode!.Trim(), user.Email, ct);
        }

        // 3. Obtener la ciudad configurada (con fallback automático si Landing está caído)
        var city = await _settings.GetDefaultCityAsync(ct);

        // 4. Correo de bienvenida según el rol
        var (subject, body) = user.Role == "driver"
            ? ("Bienvenido a Bugie · Conductor",
               EmailTemplates.WelcomeDriver(user.FullName, city))
            : ("Bienvenido a Bugie · Verifica tu cuenta",
               EmailTemplates.WelcomePassenger(user.FullName, city));

        await _email.SendAsync(
            toEmail: user.Email,
            toName: user.FullName,
            subject: subject,
            htmlBody: body,
            ct);

        return new AuthResponse(_tokens.GenerateToken(user), user.Role, user.FullName, user.Id);
    }
}