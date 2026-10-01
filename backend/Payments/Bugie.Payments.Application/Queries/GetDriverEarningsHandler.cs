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
        var thisMonth = completed
            .Where(p => p.PaidAt?.Month == DateTime.UtcNow.Month
                     && p.PaidAt?.Year  == DateTime.UtcNow.Year)
            .Sum(p => p.Amount);

        return new DriverEarningsDto(
            q.DriverId,
            completed.Sum(p => p.Amount),
            completed.Count,
            thisMonth);
    }
}
