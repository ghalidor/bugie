using System.Security.Cryptography;
using System.Text;
using MediatR;
using Bugie.Auth.Application.Email;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class ForgotPasswordHandler : IRequestHandler<ForgotPasswordCommand, string>
{
    /// <summary>El enlace del correo vale 1 hora.</summary>
    public static readonly TimeSpan LinkValidity = TimeSpan.FromHours(1);

    private const string GenericMessage =
        "Si el correo existe en nuestro sistema, recibirás un enlace para crear una nueva " +
        "contraseña. El enlace vence en 1 hora y solo se puede usar una vez.";

    private readonly IUserRepository          _users;
    private readonly IPasswordResetRepository _resets;
    private readonly IEmailService            _email;
    private readonly ILandingSettingsClient   _settings;

    public ForgotPasswordHandler(
        IUserRepository users, IPasswordResetRepository resets,
        IEmailService email, ILandingSettingsClient settings)
        => (_users, _resets, _email, _settings) = (users, resets, email, settings);

    public async Task<string> Handle(ForgotPasswordCommand cmd, CancellationToken ct)
    {
        // No revelamos si el correo existe (seguridad): siempre el mismo mensaje.
        var user = string.IsNullOrWhiteSpace(cmd.Email)
            ? null
            : await _users.GetByEmailAsync(cmd.Email.Trim(), ct);
        // Cuenta eliminada: no se envía enlace (debe pedir a soporte que la restauren).
        if (user is null || user.IsDeleted) return GenericMessage;

        // Un enlace nuevo anula los anteriores sin usar.
        var token = PasswordResetToken.Generate();
        await _resets.InvalidatePendingAsync(user.Id, ct);
        await _resets.AddAsync(user.Id, PasswordResetToken.Hash(token), DateTime.UtcNow.Add(LinkValidity), ct);

        var city = await _settings.GetDefaultCityAsync(ct);
        await _email.SendAsync(
            toEmail:  user.Email,
            toName:   user.FullName,
            subject:  "Bugie · Restablece tu contraseña",
            htmlBody: EmailTemplates.PasswordReset(user.FullName, token, city),
            ct);

        return GenericMessage;
    }
}

/// <summary>
/// Token del enlace de recuperacion: 32 bytes aleatorios en base64url.
/// En la base solo se guarda su SHA-256, asi un robo de la base no sirve.
/// </summary>
public static class PasswordResetToken
{
    public static string Generate() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim()))).ToLowerInvariant();
}
