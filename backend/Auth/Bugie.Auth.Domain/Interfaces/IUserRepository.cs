using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<User?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<bool> EmailExistsAsync(string email, CancellationToken ct = default);
    Task<List<User>> GetAllAsync(string? role = null, CancellationToken ct = default);
    Task<List<User>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);

    /// <summary>
    /// Lista paginada de usuarios con búsqueda opcional y filtro de rol.
    /// Devuelve los usuarios de la página + el total que matchean (para
    /// calcular cuántas páginas hay).
    ///
    /// Pensado para listas grandes (5000+) donde no se puede cargar todo
    /// en memoria del cliente.
    /// - page: 1-based.
    /// - pageSize: cuántos por página (típico 25-50, máx 100 por seguridad).
    /// - search: matchea contra FullName o Email (LIKE '%search%').
    /// - role: 'driver' | 'passenger' | 'admin' | null (todos).
    /// - verified: true/false para filtrar por IsVerified, null = sin filtro.
    /// </summary>
    Task<(List<User> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? search, string? role, bool? verified,
        CancellationToken ct = default);

    /// <summary>
    /// Estadísticas agregadas con 4 COUNT(*): total, activos, pasajeros, conductores.
    /// Respeta los mismos filtros search/role/verified que GetPagedAsync para que
    /// los KPIs reflejen lo que se está viendo. Una sola consulta SQL eficiente.
    /// </summary>
    Task<(int Total, int Activos, int Pasajeros, int Conductores, int Verificados, int NoVerificados)>
        GetStatsAsync(string? search, string? role, bool? verified,
            CancellationToken ct = default);
    Task AddAsync(User user, CancellationToken ct = default);
    Task UpdateAsync(User user, CancellationToken ct = default);
    /// <summary>
    /// Setea la foto de perfil del usuario. Se usa cuando el usuario sube/cambia
    /// su foto de perfil desde la app. No toca otros campos del usuario.
    /// </summary>
    Task UpdateProfilePhotoAsync(Guid userId, string photoUrl, CancellationToken ct = default);

    /// <summary>
    /// Asigna o quita el rol administrativo a un usuario (pasar null para quitar).
    /// Solo tiene efecto real si el usuario tiene Role='admin'; los pasajeros/conductores
    /// pueden tenerlo en NULL siempre.
    /// </summary>
    Task UpdateAdminRoleAsync(Guid userId, Guid? adminRoleId, CancellationToken ct = default);

    Task DeleteAsync(Guid id, CancellationToken ct = default);
}