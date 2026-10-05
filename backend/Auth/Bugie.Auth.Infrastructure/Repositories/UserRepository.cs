using System.Data;
using Dapper;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly IDbConnection _db;
    public UserRepository(IDbConnection db) => _db = db;

    public Task<User?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<User>(
            "SELECT * FROM auth.Users WHERE Id = @Id", new { Id = id });

    public Task<User?> GetByEmailAsync(string email, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<User>(
            "SELECT * FROM auth.Users WHERE Email = @Email",
            new { Email = email.ToLowerInvariant().Trim() });

    public async Task<bool> EmailExistsAsync(string email, CancellationToken ct = default)
    {
        var n = await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(1) FROM auth.Users WHERE Email = @Email",
            new { Email = email.ToLowerInvariant().Trim() });
        return n > 0;
    }

    public async Task<(List<User> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? search, string? role, bool? verified,
        CancellationToken ct = default, bool? deleted = false)
    {
        // Clamp para seguridad: nunca más de 100 por página, mínimo 1.
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        // Construcción dinámica del WHERE para combinar filtros opcionales.
        // El search es LIKE '%X%' en FullName o Email. Con índice, los prefijos
        // se aprovechan; los wildcards al inicio degradan a scan, pero con
        // 5000-50000 filas SQL Server sigue siendo rápido (cientos de ms).
        var where = new List<string>();
        var p = new DynamicParameters();

        if(!string.IsNullOrWhiteSpace(role))
        {
            where.Add("Role = @Role");
            p.Add("Role", role);
        }
        if(verified.HasValue)
        {
            where.Add("IsVerified = @Verified");
            p.Add("Verified", verified.Value);
        }
        // Cuentas eliminadas: por defecto NO se incluyen (deleted=false).
        // deleted=true -> solo eliminadas; null -> todas.
        if(deleted.HasValue)
            where.Add(deleted.Value ? "DeletedAt IS NOT NULL" : "DeletedAt IS NULL");
        if(!string.IsNullOrWhiteSpace(search))
        {
            where.Add("(FullName LIKE @SearchLike OR Email LIKE @SearchLike OR DocNumber LIKE @SearchLike)");
            p.Add("SearchLike", $"%{search.Trim()}%");
        }

        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);

        // Una sola ida a BD para datos paginados y otra para el total.
        // Podríamos hacerlo en una sola query con COUNT(*) OVER() pero
        // separadas es más legible y SQL Server las cachea bien.
        var dataSql = $@"
            SELECT * FROM auth.Users
            {whereSql}
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip";
        var countSql = $"SELECT COUNT(*) FROM auth.Users {whereSql}";

        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var items = (await _db.QueryAsync<User>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);

        return (items, total);
    }

    public async Task<(int Total, int Activos, int Pasajeros, int Conductores, int Verificados, int NoVerificados)>
        GetStatsAsync(string? search, string? role, bool? verified,
            CancellationToken ct = default, bool? deleted = false)
    {
        // 6 COUNT(*) en una sola query usando SUM(CASE WHEN...) es más
        // eficiente que 6 round-trips separados (1 ida a BD vs 6).
        // Respeta los mismos filtros que GetPagedAsync para que los KPIs
        // reflejen lo que el admin está viendo en la lista.
        var where = new List<string>();
        var p = new DynamicParameters();

        if(!string.IsNullOrWhiteSpace(role))
        {
            where.Add("Role = @Role");
            p.Add("Role", role);
        }
        if(verified.HasValue)
        {
            where.Add("IsVerified = @Verified");
            p.Add("Verified", verified.Value);
        }
        // Cuentas eliminadas: por defecto NO se incluyen (deleted=false).
        // deleted=true -> solo eliminadas; null -> todas.
        if(deleted.HasValue)
            where.Add(deleted.Value ? "DeletedAt IS NOT NULL" : "DeletedAt IS NULL");
        if(!string.IsNullOrWhiteSpace(search))
        {
            where.Add("(FullName LIKE @SearchLike OR Email LIKE @SearchLike OR DocNumber LIKE @SearchLike)");
            p.Add("SearchLike", $"%{search.Trim()}%");
        }
        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);

        var sql = $@"
            SELECT
                COUNT(*)                                                     AS Total,
                SUM(CASE WHEN IsActive    = TRUE            THEN 1 ELSE 0 END)  AS Activos,
                SUM(CASE WHEN Role        = 'passenger'  THEN 1 ELSE 0 END)  AS Pasajeros,
                SUM(CASE WHEN Role        = 'driver'     THEN 1 ELSE 0 END)  AS Conductores,
                SUM(CASE WHEN IsVerified  = TRUE            THEN 1 ELSE 0 END)  AS Verificados,
                SUM(CASE WHEN IsVerified  = FALSE            THEN 1 ELSE 0 END)  AS NoVerificados
            FROM auth.Users
            {whereSql}";

        var row = await _db.QuerySingleAsync<UserStatsRow>(sql, p);
        return (row.Total, row.Activos, row.Pasajeros, row.Conductores,
                row.Verificados, row.NoVerificados);
    }

    /// <summary>
    /// Clase auxiliar interna para que Dapper mapee por nombre de columna.
    /// No se expone fuera del repo (la interface devuelve tuple).
    /// </summary>
    private class UserStatsRow
    {
        public int Total { get; set; }
        public int Activos { get; set; }
        public int Pasajeros { get; set; }
        public int Conductores { get; set; }
        public int Verificados { get; set; }
        public int NoVerificados { get; set; }
    }

    public async Task<List<User>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var idList = ids?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new List<User>();

        // Postgres/Npgsql: usamos = ANY(@Ids) con un arreglo en vez de IN @Ids.
        // Dapper NO expande "IN @Ids" con Npgsql y manda "IN $1" -> 42601
        // (error de sintaxis). = ANY(@arreglo) es la forma nativa y correcta.
        var rows = await _db.QueryAsync<User>(
            "SELECT * FROM auth.Users WHERE Id = ANY(@Ids)",
            new { Ids = idList.ToArray() });
        return rows.ToList();
    }

    public Task AddAsync(User user, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.Users (Id, Email, PasswordHash, Role, FullName, Phone, IsActive, IsVerified, CreatedAt, TermsAccepted, TermsAcceptedAt, SignatureImage,
                                    DocType, DocNumber, FirstNames, LastNamePaternal, LastNameMaternal, SecurityStamp)
            VALUES (@Id, @Email, @PasswordHash, @Role, @FullName, @Phone, @IsActive, @IsVerified, @CreatedAt, @TermsAccepted, @TermsAcceptedAt, @SignatureImage,
                    @DocType, @DocNumber, @FirstNames, @LastNamePaternal, @LastNameMaternal, @SecurityStamp)",
            user);

    public Task UpdateAsync(User user, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE auth.Users SET IsActive = @IsActive, IsVerified = @IsVerified WHERE Id = @Id",
            new { user.IsActive, user.IsVerified, user.Id });

    public Task UpdateProfilePhotoAsync(Guid userId, string photoUrl, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE auth.Users SET ProfilePhotoUrl = @PhotoUrl WHERE Id = @Id",
            new { PhotoUrl = photoUrl, Id = userId });

    public Task UpdateAdminRoleAsync(Guid userId, Guid? adminRoleId, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE auth.Users SET AdminRoleId = @AdminRoleId WHERE Id = @UserId",
            new { UserId = userId, AdminRoleId = adminRoleId });

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM auth.Users WHERE Id = @Id", new { Id = id });

    public Task<User?> GetActiveByDocumentAsync(string docType, string docNumber, Guid? excludeUserId = null,
        CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<User>(@"
            SELECT * FROM auth.Users
            WHERE DocType = @DocType AND DocNumber = @DocNumber AND DeletedAt IS NULL
              AND (@Exclude::uuid IS NULL OR Id <> @Exclude::uuid)
            LIMIT 1",
            new { DocType = docType, DocNumber = docNumber, Exclude = excludeUserId });

    public Task UpdateDocumentAsync(Guid userId, string docType, string docNumber, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE auth.Users SET DocType = @DocType, DocNumber = @DocNumber WHERE Id = @Id",
            new { DocType = docType, DocNumber = docNumber, Id = userId });

    public Task UpdateNamesAsync(User user, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.Users SET
                FirstNames = @FirstNames, LastNamePaternal = @LastNamePaternal,
                LastNameMaternal = @LastNameMaternal, FullName = @FullName
            WHERE Id = @Id",
            new { user.FirstNames, user.LastNamePaternal, user.LastNameMaternal, user.FullName, user.Id });

    public Task UpdatePasswordHashAsync(Guid userId, string passwordHash, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE auth.Users SET PasswordHash = @Hash WHERE Id = @Id",
            new { Hash = passwordHash, Id = userId });

    public Task UpdateDeletionAsync(User user, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.Users SET DeletedAt = @DeletedAt, DeletedReason = @DeletedReason, IsActive = @IsActive
            WHERE Id = @Id",
            new { user.DeletedAt, user.DeletedReason, user.IsActive, user.Id });

    public async Task<bool> IsDeletedAsync(Guid userId, CancellationToken ct = default) =>
        await _db.ExecuteScalarAsync<bool?>(
            "SELECT DeletedAt IS NOT NULL FROM auth.Users WHERE Id = @Id", new { Id = userId }) == true;

    public async Task<UserSessionState?> GetSessionStateAsync(Guid userId, CancellationToken ct = default)
    {
        var r = await _db.QuerySingleOrDefaultAsync<SessionRow>(@"
            SELECT Id AS UserId, SecurityStamp, SecurityStampChangedAt, IsActive,
                   DeletedAt IS NOT NULL AS IsDeleted, DeactivatedAt IS NOT NULL AS IsDeactivated, Role
            FROM auth.Users WHERE Id = @Id",
            new { Id = userId });
        return r is null ? null
            : new UserSessionState(r.UserId, r.SecurityStamp, r.SecurityStampChangedAt,
                r.IsActive, r.IsDeleted, r.IsDeactivated, r.Role);
    }

    private class SessionRow
    {
        public Guid UserId { get; set; }
        public Guid SecurityStamp { get; set; }
        public DateTime? SecurityStampChangedAt { get; set; }
        public bool IsActive { get; set; }
        public bool IsDeleted { get; set; }
        public bool IsDeactivated { get; set; }
        public string Role { get; set; } = string.Empty;
    }

    public Task<Guid> RotateSecurityStampAsync(Guid userId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<Guid>(@"
            UPDATE auth.Users
               SET SecurityStamp = gen_random_uuid(), SecurityStampChangedAt = (now() AT TIME ZONE 'utc')
             WHERE Id = @Id
            RETURNING SecurityStamp",
            new { Id = userId });

    public Task UpdateDeactivationAsync(User user, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.Users SET IsActive = @IsActive, DeactivatedAt = @DeactivatedAt, DeactivatedReason = @DeactivatedReason
            WHERE Id = @Id",
            new { user.IsActive, user.DeactivatedAt, user.DeactivatedReason, user.Id });
}