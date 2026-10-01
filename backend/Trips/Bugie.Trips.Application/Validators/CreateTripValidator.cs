using FluentValidation;
using Bugie.Trips.Application.Commands;

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
    }
}