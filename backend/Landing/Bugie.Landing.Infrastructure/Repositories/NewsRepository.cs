using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

public class NewsRepository : INewsRepository {
    private readonly IDbConnection _db;
    public NewsRepository(IDbConnection db) => _db = db;

    public async Task<List<NewsArticle>> GetPublishedAsync(
        string lang = "es", CancellationToken ct = default) {
        var rows = await _db.QueryAsync<NewsArticle>(@"
            SELECT * FROM landing.NewsArticles
            WHERE IsPublished = TRUE AND Lang = @Lang
            ORDER BY PublishedAt DESC",
            new { Lang = lang });
        return rows.ToList();
    }

    public Task<NewsArticle?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<NewsArticle>(
            "SELECT * FROM landing.NewsArticles WHERE Id = @Id", new { Id = id });

    public Task AddAsync(NewsArticle article, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO landing.NewsArticles
                (Id, Slug, Tag, Title, Summary, Lang, IsPublished, PublishedAt, CreatedAt)
            VALUES
                (@Id, @Slug, @Tag, @Title, @Summary, @Lang, @IsPublished, @PublishedAt, @CreatedAt)",
            article);

    public Task UpdateAsync(NewsArticle article, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.NewsArticles SET
                Slug = @Slug, Tag = @Tag, Title = @Title,
                Summary = @Summary, IsPublished = @IsPublished
            WHERE Id = @Id",
            article);

    public async Task<(List<NewsArticle> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string lang, string? search,
        string? tag, bool? onlyPublished,
        CancellationToken ct = default) {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        // Filtros: lang siempre. Search/tag/onlyPublished opcionales.
        var where = new List<string> { "Lang = @Lang" };
        var p = new DynamicParameters();
        p.Add("Lang", lang);

        if(!string.IsNullOrWhiteSpace(search)) {
            where.Add("(Title LIKE @SearchLike OR Summary LIKE @SearchLike)");
            p.Add("SearchLike", $"%{search.Trim()}%");
        }
        if(!string.IsNullOrWhiteSpace(tag)) {
            where.Add("Tag = @Tag");
            p.Add("Tag", tag);
        }
        if(onlyPublished.HasValue) {
            where.Add("IsPublished = @IsPublished");
            p.Add("IsPublished", onlyPublished.Value);
        }
        var whereSql = "WHERE " + string.Join(" AND ", where);

        var dataSql = $@"
            SELECT * FROM landing.NewsArticles
            {whereSql}
            ORDER BY PublishedAt DESC
            LIMIT @Take OFFSET @Skip";
        var countSql = $"SELECT COUNT(*) FROM landing.NewsArticles {whereSql}";

        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var items = (await _db.QueryAsync<NewsArticle>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);
        return (items, total);
    }

    public async Task<(int Total, int Published, int Hidden)> GetStatsAsync(
        string lang, string? search, string? tag,
        CancellationToken ct = default) {
        var where = new List<string> { "Lang = @Lang" };
        var p = new DynamicParameters();
        p.Add("Lang", lang);

        if(!string.IsNullOrWhiteSpace(search)) {
            where.Add("(Title LIKE @SearchLike OR Summary LIKE @SearchLike)");
            p.Add("SearchLike", $"%{search.Trim()}%");
        }
        if(!string.IsNullOrWhiteSpace(tag)) {
            where.Add("Tag = @Tag");
            p.Add("Tag", tag);
        }
        var whereSql = "WHERE " + string.Join(" AND ", where);

        var sql = $@"
            SELECT
                COUNT(*)                                              AS Total,
                SUM(CASE WHEN IsPublished = TRUE THEN 1 ELSE 0 END)      AS Published,
                SUM(CASE WHEN IsPublished = FALSE THEN 1 ELSE 0 END)      AS Hidden
            FROM landing.NewsArticles
            {whereSql}";

        var row = await _db.QuerySingleAsync<NewsStatsRow>(sql, p);
        return (row.Total, row.Published, row.Hidden);
    }

    private class NewsStatsRow {
        public int Total { get; set; }
        public int Published { get; set; }
        public int Hidden { get; set; }
    }
}
