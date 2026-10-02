namespace Bugie.Payments.Application.DTOs;

public record CreatePaymentRequest(Guid TripId, Guid PassengerId, Guid DriverId, decimal Amount, string Method);
public record CompletePaymentRequest(Guid PaymentId, string? Reference);

public record PaymentDto(
    Guid     Id,
    Guid     TripId,
    Guid     PassengerId,
    Guid     DriverId,
    decimal  Amount,
    string   Method,
    string   Status,
    string?  Reference,
    DateTime CreatedAt,
    DateTime? PaidAt,
    // Comision de Bugie y lo que recibe el conductor
    decimal  PlatformFee = 0,
    decimal  DriverAmount = 0,
    decimal? PlatformFeeRate = null);

public record DriverEarningsDto(
    Guid    DriverId,
    decimal TotalEarnings,
    int     TotalTrips,
    decimal EarningsThisMonth);