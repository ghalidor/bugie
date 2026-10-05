using System.Data;
using Dapper;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

public class EmergencyContactRepository : IEmergencyContactRepository
{
    private readonly IDbConnection _db;
    public EmergencyContactRepository(IDbConnection db) => _db = db;

    public Task<EmergencyContact?> GetByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<EmergencyContact>(
            "SELECT * FROM auth.EmergencyContacts WHERE UserId = @UserId",
            new { UserId = userId });

    // Si el usuario ya tiene contacto, se reemplaza (ON CONFLICT por UserId).
    public Task UpsertAsync(EmergencyContact contact, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.EmergencyContacts
                (Id, UserId, FullName, Phone, Relationship, Email, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @UserId, @FullName, @Phone, @Relationship, @Email, @CreatedAt, @UpdatedAt)
            ON CONFLICT (UserId) DO UPDATE
               SET FullName = EXCLUDED.FullName,
                   Phone = EXCLUDED.Phone,
                   Relationship = EXCLUDED.Relationship,
                   Email = EXCLUDED.Email,
                   UpdatedAt = EXCLUDED.UpdatedAt;",
            contact);
}
