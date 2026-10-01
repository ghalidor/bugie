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

    public async Task<List<User>> GetAllAsync(string? role = null, CancellationToken ct = default)
    {
        var sql = role is null
            ? "SELECT * FROM auth.Users ORDER BY CreatedAt DESC"
            : "SELECT * FROM auth.Users WHERE Role = @Role ORDER BY CreatedAt DESC";
        var rows = await _db.QueryAsync<User>(sql, role is null ? null : new { Role = role });
        return rows.ToList();
    }

    public async Task<(List<User> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? search, string? role, bool? verified,
        CancellationToken ct = default)
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
        if(!string.IsNullOrWhiteSpace(search))
        {
            where.Add("(FullName LIKE @SearchLike OR Email LIKE @SearchLike)");
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
            CancellationToken ct = default)
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
        if(!string.IsNullOrWhiteSpace(search))
        {
            where.Add("(FullName LIKE @SearchLike OR Email LIKE @SearchLike)");
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
            INSERT INTO auth.Users (Id, Email, PasswordHash, Role, FullName, Phone, IsActive, IsVerified, CreatedAt, TermsAccepted, TermsAcceptedAt, SignatureImage)
            VALUES (@Id, @Email, @PasswordHash, @Role, @FullName, @Phone, @IsActive, @IsVerified, @CreatedAt, @TermsAccepted, @TermsAcceptedAt, @SignatureImage)",
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
}