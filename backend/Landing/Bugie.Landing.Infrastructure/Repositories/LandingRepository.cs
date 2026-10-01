using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

public class LandingRepository : ILandingRepository
{
    private readonly IDbConnection _db;
    public LandingRepository(IDbConnection db) => _db = db;

    public async Task<List<LandingSection>> GetAllSectionsAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<LandingSection>(
            "SELECT * FROM landing.Sections ORDER BY SortOrder ASC");
        return rows.ToList();
    }

    public Task<LandingSection?> GetSectionByKeyAsync(string key, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<LandingSection>(
            "SELECT * FROM landing.Sections WHERE SectionKey = @Key", new { Key = key });

    public Task<SectionContent?> GetContentAsync(Guid sectionId, string lang, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<SectionContent>(
            "SELECT * FROM landing.SectionContents WHERE SectionId = @SectionId AND Lang = @Lang",
            new { SectionId = sectionId, Lang = lang });

    public async Task<List<SectionContent>> GetAllContentAsync(string lang, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<SectionContent>(
            "SELECT * FROM landing.SectionContents WHERE Lang = @Lang", new { Lang = lang });
        return rows.ToList();
    }

    public Task AddSectionAsync(LandingSection s, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            @"INSERT INTO landing.Sections (Id,SectionKey,SortOrder,IsVisible,UpdatedAt)
              VALUES (@Id,@SectionKey,@SortOrder,@IsVisible,@UpdatedAt)", s);

    public Task AddContentAsync(SectionContent c, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            @"INSERT INTO landing.SectionContents (Id,SectionId,Lang,ContentJson,UpdatedAt)
              VALUES (@Id,@SectionId,@Lang,@ContentJson,@UpdatedAt)", c);

    public Task UpdateSectionAsync(LandingSection s, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE landing.Sections SET SortOrder=@SortOrder, IsVisible=@IsVisible, UpdatedAt=@UpdatedAt WHERE Id=@Id", s);

    public Task UpdateContentAsync(SectionContent c, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE landing.SectionContents SET ContentJson=@ContentJson, UpdatedAt=@UpdatedAt WHERE Id=@Id", c);
}