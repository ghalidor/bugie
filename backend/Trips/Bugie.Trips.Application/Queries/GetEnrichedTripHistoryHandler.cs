using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public record GetEnrichedTripHistoryQuery(Guid UserId, string Role)
    : IRequest<List<EnrichedTripDto>>;

public class GetEnrichedTripHistoryHandler
    : IRequestHandler<GetEnrichedTripHistoryQuery, List<EnrichedTripDto>>
{
    private readonly ITripRepository _trips;
    private readonly IAuthClient _auth;
    private readonly IDriversClient _drivers;

    public GetEnrichedTripHistoryHandler(
        ITripRepository trips,
        IAuthClient auth,
        IDriversClient drivers)
    {
        _trips = trips;
        _auth = auth;
        _drivers = drivers;
    }

    public async Task<List<EnrichedTripDto>> Handle(
        GetEnrichedTripHistoryQuery q, CancellationToken ct)
    {
        // 1. Lista cruda de viajes
        var trips = q.Role == "driver"
            ? await _trips.GetByDriverAsync(q.UserId, ct)
            : await _trips.GetByPassengerAsync(q.UserId, ct);

        if(trips.Count == 0) return new List<EnrichedTripDto>();

        // 2. UserIds únicos del conductor (Trip.DriverId guarda el UserId, no el DriverId)
        var driverUserIds = trips
            .Where(t => t.DriverId.HasValue)
            .Select(t => t.DriverId!.Value)
            .Distinct()
            .ToList();

        // 3. Info conductor + vehículo (indexada por UserId)
        var driverInfoMap = driverUserIds.Count == 0
            ? new Dictionary<Guid, DriverTripInfoDto>()
            : await _drivers.GetDriverTripInfoAsync(driverUserIds, ct);

        // 4. Nombre del conductor desde Auth
        var userMap = driverUserIds.Count == 0
            ? new Dictionary<Guid, UserInfoDto>()
            : await _auth.GetUsersByIdsAsync(driverUserIds, ct);

        // 5. Mapear cada viaje enriquecido
        var result = new List<EnrichedTripDto>(trips.Count);
        foreach(var t in trips)
        {
            DriverTripInfoDto? driverInfo = null;
            UserInfoDto? userInfo = null;

            if(t.DriverId.HasValue)
            {
                driverInfoMap.TryGetValue(t.DriverId.Value, out driverInfo);
                userMap.TryGetValue(t.DriverId.Value, out userInfo);
            }

            result.Add(new EnrichedTripDto(
                Id: t.Id,
                PassengerId: t.PassengerId,
                DriverId: t.DriverId,
                OriginAddress: t.OriginAddress,
                OriginLat: t.OriginLat,
                OriginLng: t.OriginLng,
                DestAddress: t.DestAddress,
                DestLat: t.DestLat,
                DestLng: t.DestLng,
                EstimatedFare: t.EstimatedFare,
                FinalFare: t.FinalFare,
                PaymentMethod: t.PaymentMethod,
                Status: (int)t.Status,
                CreatedAt: t.CreatedAt,
                StartedAt: t.StartedAt,
                CompletedAt: t.CompletedAt,
                DriverFullName: userInfo?.FullName,
                DriverPhotoUrl: driverInfo?.PhotoUrl,
                DriverRating: driverInfo?.Rating,
                DriverTotalRatings: driverInfo?.TotalRatings,
                VehiclePlate: driverInfo?.VehiclePlate,
                VehicleBrand: driverInfo?.VehicleBrand,
                VehicleModel: driverInfo?.VehicleModel,
                VehicleColor: driverInfo?.VehicleColor,
                VehicleYear: driverInfo?.VehicleYear,
                VehiclePhotoUrl: driverInfo?.VehiclePhotoUrl,
                Category: t.ServiceType == Bugie.Trips.Domain.Enums.ServiceType.Delivery ? "delivery" : "city_ride",
                ServiceType: (int)t.ServiceType,
                PackageDescription: t.PackageDescription,
                PackageWeightKg: t.PackageWeightKg,
                PackageIsFragile: t.PackageIsFragile,
                PackageDetails: t.PackageDetails,
                RecipientName: t.RecipientName,
                RecipientPhone: t.RecipientPhone,
                PickupVerified: t.PickupVerified,
                DeliveryReceivedBy: t.DeliveryReceivedBy,
                DeliveryConfirmedAt: t.DeliveryConfirmedAt,
                CancelledBy: t.CancelledBy,
                CancelReason: t.CancelReason,
                ScheduledAt: t.ScheduledAt,
                DriverArrivedAt: t.DriverArrivedAt,
                DriverLate: t.IsDriverLate(DateTime.UtcNow)));
        }

        return result;
    }
}