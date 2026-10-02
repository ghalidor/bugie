using Bugie.Payments.Domain.Common;
using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

public class GetDriverEarningsHandler : IRequestHandler<GetDriverEarningsQuery, DriverEarningsDto>
{
    private readonly IPaymentRepository _payments;
    public GetDriverEarningsHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<DriverEarningsDto> Handle(GetDriverEarningsQuery q, CancellationToken ct)
    {
        var list      = await _payments.GetByDriverAsync(q.DriverId, ct);
        var completed = list.Where(p => p.Status == "completed").ToList();
        // Lo que gana el conductor es DriverAmount (monto menos comision).
        // El mes se cuenta en hora de Peru.
        var hoy = BugieTime.Now;
        var thisMonth = completed
            .Where(p => p.PaidAt is not null
                     && BugieTime.ToPeru(p.PaidAt.Value).Month == hoy.Month
                     && BugieTime.ToPeru(p.PaidAt.Value).Year  == hoy.Year)
            .Sum(p => p.DriverAmount);

        return new DriverEarningsDto(
            q.DriverId,
            completed.Sum(p => p.DriverAmount),
            completed.Count,
            thisMonth);
    }
}
