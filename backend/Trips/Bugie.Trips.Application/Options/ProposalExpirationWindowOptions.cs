namespace Bugie.Trips.Application.Options;

/// <summary>
/// Ventana de confirmacion de una propuesta 'accepted_by_passenger'.
/// Se enlaza con la MISMA seccion "ProposalExpiration" que usa
/// ProposalExpirationService (Infrastructure), que la marca 'rejected'
/// (RejectedBy = 'driver_no_confirm') cuando CreatedAt + ExpireAfterMinutes
/// ya paso. Aqui solo se lee para informar al conductor cuando vence.
/// </summary>
public class ProposalExpirationWindowOptions
{
    /// <summary>Default 30, igual que ProposalExpirationOptions.ExpireAfterMinutes.</summary>
    public int ExpireAfterMinutes { get; set; } = 30;
}
