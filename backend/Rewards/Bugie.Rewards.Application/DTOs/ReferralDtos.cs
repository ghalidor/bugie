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

/// <summary>Resumen del programa de referidos, para el admin.</summary>
public record ReferralStatsDto(
    int TotalReferrals,
    int Qualified,
    int Pending,
    int PointsGiven,
    /// <summary>Cuántos usuarios ya tienen código generado.</summary>
    int CodesIssued,
    int InvitationsSent,
    /// <summary>Invitaciones que terminaron en un registro.</summary>
    int InvitationsAccepted,
    List<TopReferrerDto> TopReferrers);

public record TopReferrerDto(
    Guid     UserId,
    string?  FullName,
    string?  Email,
    int      Invited,
    int      Qualified,
    int      PointsEarned,
    DateTime LastAt);
