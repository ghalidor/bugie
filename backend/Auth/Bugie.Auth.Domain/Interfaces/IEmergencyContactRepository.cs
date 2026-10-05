using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface IEmergencyContactRepository
{
    /// <summary>Contacto de emergencia del usuario, o null si no registró uno.</summary>
    Task<EmergencyContact?> GetByUserIdAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Crea o reemplaza el contacto del usuario (uno por usuario).</summary>
    Task UpsertAsync(EmergencyContact contact, CancellationToken ct = default);
}
