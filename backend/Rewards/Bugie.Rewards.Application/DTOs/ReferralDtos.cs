namespace Bugie.Rewards.Application.DTOs;

/// <summary>Mi código de invitación y cómo me está yendo.</summary>
public record MyReferralDto(
    string Code,
    bool   Enabled,
    int    TotalInvited,
    int    Qualified,
    int    PointsEarned,
    /// <summary>Lo que gano por referir a cada tipo de usuario.</summary>
    int    PointsPerPassenger,
    int    PointsPerDriver,
    /// <summary>Viajes que debe completar el referido para el bono extra.</summary>
    int    QualifyTrips,
    int    QualifyPoints,
    List<ReferredPersonDto> People);

public record ReferredPersonDto(
    string   UserType,
    string   Status,
    int      TripsCompleted,
    int      PointsEarned,
    DateTime JoinedAt);

/// <summary>Resultado de registrar un referido. Nunca es un error fatal.</summary>
public record ReferralResultDto(bool Applied, int PointsAwarded, string? Reason);
