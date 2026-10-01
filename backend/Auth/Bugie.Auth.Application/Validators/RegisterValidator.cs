using FluentValidation;
using Bugie.Auth.Application.Commands;

namespace Bugie.Auth.Application.Validators;

public class RegisterUserValidator : AbstractValidator<RegisterUserCommand>
{
    private static readonly string[] AllowedRoles = ["passenger", "driver"];

    public RegisterUserValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(200);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(100);
        RuleFor(x => x.Phone).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Role).Must(r => AllowedRoles.Contains(r))
            .WithMessage("Role debe ser 'passenger' o 'driver'.");

        // Debe marcar el check de aceptación de términos y condiciones.
        RuleFor(x => x.AcceptedTerms).Equal(true)
            .WithMessage("Debe aceptar los términos y condiciones.");

        // Debe firmar (la firma llega como imagen PNG en base64 / data URL).
        RuleFor(x => x.SignatureImage).NotEmpty()
            .WithMessage("Debe firmar para completar el registro.");
    }
}
