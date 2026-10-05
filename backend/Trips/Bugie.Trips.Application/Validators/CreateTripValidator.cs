using FluentValidation;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Domain.Common;

namespace Bugie.Trips.Application.Validators;

public class CreateTripValidator : AbstractValidator<CreateTripCommand>
{
    public CreateTripValidator()
    {
        RuleFor(x => x.OriginAddress).NotEmpty().MaximumLength(300);
        RuleFor(x => x.DestAddress).NotEmpty().MaximumLength(300);
        RuleFor(x => x.EstimatedFare).GreaterThan(0);
        RuleFor(x => x.PaymentMethod).Must(m => new[]{"cash","yape","plin"}.Contains(m))
            .WithMessage("PaymentMethod debe ser cash, yape o plin.");
        RuleFor(x => x.PassengerId).NotEmpty();

        // Programado: minimo ~30 min desde ahora y maximo 7 dias adelante.
        // ScheduledAt ya llega en UTC (el controller lo normaliza).
        When(x => x.ScheduledAt.HasValue, () =>
        {
            RuleFor(x => x.ScheduledAt!.Value)
                .Must(v => v >= DateTime.UtcNow.AddMinutes(
                    ScheduledTrips.MinLeadMinutes - ScheduledTrips.MinLeadToleranceMinutes))
                .WithMessage($"Programa con al menos {ScheduledTrips.MinLeadMinutes} minutos de anticipación.")
                .Must(v => v <= DateTime.UtcNow.AddDays(ScheduledTrips.MaxDaysAhead))
                .WithMessage($"Solo puedes programar hasta {ScheduledTrips.MaxDaysAhead} días adelante.");
        });

        // Envios: datos del paquete y de quien recibe. Los largos coinciden
        // con las columnas de la base (recipientname 120, recipientphone 20).
        When(x => x.ServiceType == Bugie.Trips.Domain.Enums.ServiceType.Delivery, () =>
        {
            RuleFor(x => x.PackageDescription).NotEmpty()
                .WithMessage("Describe qué vas a enviar.").MaximumLength(500);
            RuleFor(x => x.PackageWeightKg).GreaterThan(0)
                .When(x => x.PackageWeightKg.HasValue)
                .WithMessage("El peso del paquete debe ser mayor a 0.");
            RuleFor(x => x.PackageDetails).MaximumLength(1000);
            RuleFor(x => x.RecipientName).NotEmpty()
                .WithMessage("Indica el nombre de quien recibe el envío.").MaximumLength(120);
            RuleFor(x => x.RecipientPhone).NotEmpty()
                .WithMessage("Indica el teléfono de quien recibe el envío.")
                .Matches(@"^\+?[0-9 ]{6,20}$")
                .WithMessage("El teléfono de quien recibe no es válido (solo números, 6 a 20 dígitos).");
        });
    }
}