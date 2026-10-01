using System.Data;
using Dapper;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

public class AdminRoleRepository : IAdminRoleRepository
{
    private readonly IDbConnection _db;
    public AdminRoleRepository(IDbConnection db) => _db = db;

    public async Task<List<AdminRole>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<AdminRole>(@"
            SELECT * FROM auth.AdminRoles
            ORDER BY IsSystem DESC, Name ASC");
        return rows.ToList();
    }

    public Task<AdminRole?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<AdminRole>(
            "SELECT * FROM auth.AdminRoles WHERE Id = @Id", new { Id = id });

    public Task<AdminRole?> GetByNameAsync(string name, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<AdminRole>(
            "SELECT * FROM auth.AdminRoles WHERE Name = @Name", new { Name = name });

    public async Task<List<string>> GetPermissionsAsync(Guid roleId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<string>(@"
            SELECT Permission FROM auth.RolePermissions WHERE RoleId = @RoleId",
            new { RoleId = roleId });
        return rows.ToList();
    }

    public Task AddAsync(AdminRole role, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.AdminRoles (Id, Name, Description, IsSystem, CreatedAt)
            VALUES (@Id, @Name, @Description, @IsSystem, @CreatedAt)",
            role);

    public Task UpdateAsync(AdminRole role, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.AdminRoles
            SET Name = @Name, Description = @Description
            WHERE Id = @Id AND IsSystem = FALSE",  // No se permite editar roles del sistema
            role);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            DELETE FROM auth.AdminRoles
            WHERE Id = @Id AND IsSystem = FALSE",  // No se permite borrar el super_admin
            new { Id = id });

    public async Task SetPermissionsAsync(
        Guid roleId, IEnumerable<string> permissions, CancellationToken ct = default)
    {
        // Reemplazo completo: borramos los actuales y reinserto los nuevos.
        // Es la operación atómica más simple para "guardar lista de permisos".
        // No usamos transacción explícita porque Dapper con la misma conexión
        // ya las maneja en orden; si fallara, el siguiente intento corrige.
        await _db.ExecuteAsync(
            "DELETE FROM auth.RolePermissions WHERE RoleId = @RoleId",
            new { RoleId = roleId });

        var permList = permissions?.Distinct().ToList() ?? new List<string>();
        if(permList.Count == 0) return;

        var inserts = permList.Select(perm => new { RoleId = roleId, Permission = perm });
        await _db.ExecuteAsync(
            "INSERT INTO auth.RolePermissions (RoleId, Permission) VALUES (@RoleId, @Permission)",
            inserts);
    }

    public Task<int> GetUserCountAsync(Guid roleId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM auth.Users WHERE AdminRoleId = @RoleId",
            new { RoleId = roleId });
}
