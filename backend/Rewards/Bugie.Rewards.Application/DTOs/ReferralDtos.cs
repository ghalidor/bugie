namespace Bugie.Rewards.Application.DTOs;

/// <summary>Mi código de invitación y cómo me está yendo.</summary>
/// <param name="PointsPerPassenger">Lo que gano por referir a cada tipo de usuario.</param>
/// <param name="QualifyTrips">Viajes que debe completar el referido para el bono extra.</param>
public record MyReferralDto(
    string Code,
    bool   Enabled,
    int    TotalInvited,
    int    Qualified,
    int    PointsEarned,
    int    PointsPerPassenger,
    int    PointsPerDriver,
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
/// <param name="CodesIssued">Cuántos usuarios ya tienen código generado.</param>
/// <param name="InvitationsAccepted">Invitaciones que terminaron en un registro.</param>
public record ReferralStatsDto(
    int TotalReferrals,
    int Qualified,
    int Pending,
    int PointsGiven,
    int CodesIssued,
    int InvitationsSent,
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

/// <summary>Una posición del ranking entre amigos.</summary>
/// <param name="IsMe">true si es el propio usuario, para resaltarlo.</param>
/// <param name="Relation">Cómo entró al ranking: «te invitó» o «lo invitaste».</param>
public record RankingEntryDto(
    int      Position,
    Guid     UserId,
    string?  FullName,
    string   Level,
    int      PointsThisMonth,
    int      Trips,
    bool     IsMe,
    string   Relation);

public record FriendsRankingDto(
    int    MyPosition,
    int    MyPointsThisMonth,
    string MonthLabel,
    List<RankingEntryDto> Entries);
