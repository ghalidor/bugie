using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class AddReviewHandler : IRequestHandler<AddReviewCommand, Unit>
{
    private readonly IDriverRepository _drivers;
    private readonly IReviewRepository _reviews;
    public AddReviewHandler(IDriverRepository d, IReviewRepository r)
        => (_drivers, _reviews) = (d, r);

    public async Task<Unit> Handle(AddReviewCommand cmd, CancellationToken ct)
    {
        if (await _reviews.ExistsForTripAsync(cmd.TripId, ct))
            throw new InvalidOperationException("Ya existe una calificación para este viaje.");

        var driver = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        var review = Review.Create(
            cmd.DriverId, cmd.PassengerId, cmd.TripId, cmd.Rating, cmd.Comment);

        await _reviews.AddAsync(review, ct);
        driver.AddRating(cmd.Rating);
        await _drivers.UpdateAsync(driver, ct);
        return Unit.Value;
    }
}
