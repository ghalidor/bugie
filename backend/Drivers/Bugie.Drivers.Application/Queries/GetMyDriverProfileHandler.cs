using MediatR;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

public class GetMyDriverProfileHandler : IRequestHandler<GetMyDriverProfileQuery, DriverDto?>
{
    private readonly IDriverRepository _drivers;
    private readonly DriverDocumentsDeadlineService _deadline;
    private readonly IDriverReviewRequestRepository _reviews;
    public GetMyDriverProfileHandler(IDriverRepository d, DriverDocumentsDeadlineService deadline,
        IDriverReviewRequestRepository reviews)
        => (_drivers, _deadline, _reviews) = (d, deadline, reviews);

    public async Task<DriverDto?> Handle(GetMyDriverProfileQuery q, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(q.UserId, ct);
        if(d is null) return null;

        // Documentos obligatorios que faltan (para el aviso del plazo en la app/web)
        var missing = await _deadline.GetMissingAsync(d.Id, ct);
        // Solicitud de revisión abierta (rechazado/suspendido)
        var open = await _reviews.GetOpenByDriverAsync(d.Id, ct);
        return RegisterDriverHandler.ToDto(d) with
        {
            MissingDocuments = missing,
            OpenReviewRequest = DriverAccountService.ToDto(open),
        };
    }
}
