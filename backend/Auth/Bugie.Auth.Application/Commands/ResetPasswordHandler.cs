using MediatR;
using Bugie.Auth.Application.Email;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class ResetPasswordHandler : IRequestHandler<ResetPasswordCommand, bool>
{
    public const string InvalidLinkMessage =
        "El enlace no es válido, ya se usó o venció. Solicita uno nuevo desde \"Olvidé mi contraseña\".";

    private readonly IUserRepository          _users;
    private readonly IPasswordResetRepository _resets;
    private readonly IPasswordHasher          _hasher;
    private readonly IEmailService            _email;
    private readonly ILandingSettingsClient   _settings;

    public ResetPasswordHandler(
        IUserRepository users, IPasswordResetRepository resets, IPasswordHasher hasher,
        IEmailService email, ILandingSettingsClient settings)
        => (_users, _resets, _hasher, _email, _settings) = (users, resets, hasher, email, settings);

    public async Task<bool> Handle(ResetPasswordCommand cmd, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cmd.Token) || string.IsNullOrWhiteSpace(cmd.NewPassword))
            throw new InvalidOperationException("El enlace y la nueva contraseña son requeridos.");

        if (cmd.NewPassword.Length < 8)
            throw new InvalidOperationException("La contraseña debe tener al menos 8 caracteres.");

        // Marca el enlace como usado (si sigue vigente) y obtiene el usuario.
        var userId = await _resets.ConsumeAsync(PasswordResetToken.Hash(cmd.Token), ct)
            ?? throw new InvalidOperationException(InvalidLinkMessage);

        await _resets.UpdatePasswordHashAsync(userId, _hasher.Hash(cmd.NewPassword), ct);

        // Constancia por correo.
        var user = await _users.GetByIdAsync(userId, ct);
        if (user is not null)
        {
            var city = await _settings.GetDefaultCityAsync(ct);
            await _email.SendAsync(
                toEmail:  user.Email,
                toName:   user.FullName,
                subject:  "Bugie · Tu contraseña fue cambiada",
                htmlBody: EmailTemplates.PasswordChanged(user.FullName, city),
                ct);
        }

        return true;
    }
}

/// <summary>¿El enlace sigue vigente? Lo usa la pagina para avisar antes de escribir.</summary>
public record ValidateResetTokenQuery(string Token) : IRequest<bool>;

public class ValidateResetTokenHandler : IRequestHandler<ValidateResetTokenQuery, bool>
{
    private readonly IPasswordResetRepository _resets;
    public ValidateResetTokenHandler(IPasswordResetRepository resets) => _resets = resets;

    public Task<bool> Handle(ValidateResetTokenQuery q, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(q.Token)
            ? Task.FromResult(false)
            : _resets.IsValidAsync(PasswordResetToken.Hash(q.Token), ct);
}
