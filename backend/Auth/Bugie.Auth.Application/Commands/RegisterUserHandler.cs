using MediatR;
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

    public RegisterUserHandler(
        IUserRepository users,
        ITokenService tokens,
        IPasswordHasher hasher,
        IEmailService email,
        IDriversClient driversClient,
        ILandingSettingsClient settings)
    {
        _users = users;
        _tokens = tokens;
        _hasher = hasher;
        _email = email;
        _driversClient = driversClient;
        _settings = settings;
    }

    public async Task<AuthResponse> Handle(RegisterUserCommand cmd, CancellationToken ct)
    {
        // Debe aceptar términos y condiciones (el check del formulario).
        if(!cmd.AcceptedTerms)
            throw new InvalidOperationException("Debe aceptar los términos y condiciones.");

        // Debe firmar (la firma llega como imagen PNG en base64 / data URL).
        if(string.IsNullOrWhiteSpace(cmd.SignatureImage))
            throw new InvalidOperationException("Debe firmar para completar el registro.");

        if(await _users.EmailExistsAsync(cmd.Email, ct))
            throw new InvalidOperationException("El correo ya está registrado.");

        // 1. Crear el usuario
        var user = User.Create(cmd.Email, _hasher.Hash(cmd.Password), cmd.Role, cmd.FullName, cmd.Phone,
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