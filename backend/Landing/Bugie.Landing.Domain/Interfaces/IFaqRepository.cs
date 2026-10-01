using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

/// <summary>
/// Repositorio de preguntas frecuentes.
/// La lectura pública usa GetPublishedAsync; el admin usa los otros métodos.
/// </summary>
public interface IFaqRepository
{
    /// <summary>
    /// Lectura pública (para la landing). Solo publicadas, agrupadas por categoría,
    /// ordenadas por SortOrder ascendente dentro de cada categoría.
    /// </summary>
    Task<List<FaqItem>> GetPublishedAsync(string lang, CancellationToken ct = default);

    /// <summary>Listado completo (admin): incluye publicadas y ocultas.</summary>
    Task<List<FaqItem>> GetAllAsync(string lang, CancellationToken ct = default);

    Task<FaqItem?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task AddAsync(FaqItem item, CancellationToken ct = default);
    Task UpdateAsync(FaqItem item, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Reasigna SortOrder de todas las preguntas dadas (en el orden de la lista).
    /// Usado por el drag & drop del admin: el frontend manda la lista nueva
    /// y el backend escribe el orden de un solo golpe.
    /// </summary>
    Task ReorderAsync(IEnumerable<Guid> orderedIds, CancellationToken ct = default);

    /// <summary>
    /// Devuelve el SortOrder máximo dentro de (lang, category) o 0 si no hay nada.
    /// Usado al crear una pregunta nueva para ponerla al final.
    /// </summary>
    Task<int> GetMaxSortOrderAsync(string lang, string category, CancellationToken ct = default);
}
