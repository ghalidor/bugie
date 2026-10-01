namespace Bugie.Rewards.Domain.Interfaces;

/* ──────────────────────────────────────────────────────────────────────────
   Estos tipos los materializa Dapper desde una consulta SQL.

   Van declarados con PROPIEDADES y no como record posicional a proposito.
   Un record posicional se construye por constructor, y eso obliga a que las
   columnas vengan en el mismo orden que los parametros, y con el tipo exacto.
   Dos cosas faciles de romper: basta reordenar una columna del SELECT, o que
   Postgres devuelva bigint donde el record pide int, que es lo que hacen
   COUNT y SUM.

   Con propiedades, Dapper mapea por NOMBRE y convierte el tipo solo.
   ────────────────────────────────────────────────────────────────────────── */

/// <summary>Resultado del buscador de usuarios.</summary>
public class UserSearchRow
{
    public Guid      UserId           { get; set; }
    public string?   FullName         { get; set; }
    public string?   Email            { get; set; }
    public string?   Phone            { get; set; }
    public string?   Role             { get; set; }
    /// <summary>false si nunca gano puntos.</summary>
    public bool      HasProfile       { get; set; }
    public string?   UserType         { get; set; }
    public string?   CurrentLevel     { get; set; }
    public int       AvailablePoints  { get; set; }
    public int       TotalPoints      { get; set; }
    public DateTime? LastActivityDate { get; set; }
}

/// <summary>Totales del programa, para el balance.</summary>
public class ProgramTotals
{
    public int Profiles           { get; set; }
    public int ProfilesWithPoints { get; set; }
    public int PointsIssued       { get; set; }
    public int PointsAvailable    { get; set; }
    public int PointsRedeemed     { get; set; }
    public int PointsExpired      { get; set; }
    public int ActiveRedemptions  { get; set; }
}

/// <summary>Cuantos puntos salieron por cada mecanica.</summary>
public class SourceBreakdown
{
    public string SourceEvent  { get; set; } = string.Empty;
    public int    Transactions { get; set; }
    public int    Points       { get; set; }
}

public class MonthlyPoints
{
    public string Month    { get; set; } = string.Empty;
    public int    Issued   { get; set; }
    public int    Redeemed { get; set; }
}

/// <summary>
/// Consultas que solo usa el admin. Van aparte de los repositorios del dominio
/// porque son agregados y reportes, no reglas de negocio.
/// </summary>
public interface IAdminQueryRepository
{
    /// <summary>Busca por correo, nombre o telefono. Incluye usuarios sin perfil.</summary>
    Task<List<UserSearchRow>> SearchUsersAsync(
        string query, int take, CancellationToken ct = default);

    Task<UserSearchRow?> GetUserAsync(Guid userId, CancellationToken ct = default);

    Task<ProgramTotals> GetTotalsAsync(CancellationToken ct = default);

    Task<List<SourceBreakdown>> GetBreakdownAsync(
        DateTime? fromUtc, CancellationToken ct = default);

    /// <summary>Puntos emitidos y canjeados por mes, ultimos N meses.</summary>
    Task<List<MonthlyPoints>> GetMonthlyAsync(int months, CancellationToken ct = default);
}
