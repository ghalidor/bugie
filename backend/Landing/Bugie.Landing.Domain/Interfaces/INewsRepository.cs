using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

public interface INewsRepository {
    Task<List<NewsArticle>> GetPublishedAsync(string lang = "es", CancellationToken ct = default);
    Task<NewsArticle?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task AddAsync(NewsArticle article, CancellationToken ct = default);
    Task UpdateAsync(NewsArticle article, CancellationToken ct = default);

    /// <summary>
    /// Lista paginada para el admin: incluye publicadas Y ocultas.
    /// (GetPublishedAsync sigue filtrando por IsPublished=TRUE para uso público.)
    /// - lang: filtra por idioma ('es' o 'en').
    /// - search: matchea Title o Summary (LIKE '%X%'). Opcional.
    /// - tag: filtra por tag específico. Opcional.
    /// - onlyPublished: true = solo publicadas, false = solo ocultas, null = ambas.
    /// </summary>
    Task<(List<NewsArticle> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string lang, string? search,
        string? tag, bool? onlyPublished,
        CancellationToken ct = default);

    /// <summary>
    /// KPIs: total, publicadas, ocultas. Filtrado por idioma + search/tag opcional.
    /// </summary>
    Task<(int Total, int Published, int Hidden)> GetStatsAsync(
        string lang, string? search, string? tag,
        CancellationToken ct = default);
}
