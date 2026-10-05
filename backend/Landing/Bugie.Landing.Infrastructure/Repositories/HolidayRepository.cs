using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

/// <summary>Feriados (landing.holidays).</summary>
public class HolidayRepository : IHolidayRepository
{
    private readonly IDbConnection _db;
    public HolidayRepository(IDbConnection db) => _db = db;

    // Date es DATE: sale como texto "yyyy-MM-dd" para que nadie le aplique zona horaria.
    private const string Cols = @"
        Id, Name, Kind, Month, Day, Movable AS MovableKey,
        to_char(Date, 'YYYY-MM-DD') AS Date, IsActive, CreatedAt";

    public async Task<List<Holiday>> GetAllAsync(CancellationToken ct = default) =>
        (await _db.QueryAsync<Holiday>($@"
            SELECT {Cols} FROM landing.holidays
            ORDER BY CASE Kind WHEN 'fijo' THEN 1 WHEN 'movil' THEN 2 ELSE 3 END,
                     Month, Day, Movable, Date")).ToList();

    public Task<Holiday?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Holiday>(
            $"SELECT {Cols} FROM landing.holidays WHERE Id = @Id", new { Id = id });

    public Task<bool> ExistsSameDayAsync(Holiday h, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<bool>(@"
            SELECT EXISTS (
              SELECT 1 FROM landing.holidays
               WHERE Id <> @Id AND Kind = @Kind
                 AND ((Kind = 'fijo'  AND Month = @Month AND Day = @Day)
                   OR (Kind = 'extra' AND Date = CAST(@Date AS date))))", h);

    public Task AddAsync(Holiday h, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO landing.holidays (Id, Name, Kind, Month, Day, Movable, Date, IsActive, CreatedAt)
            VALUES (@Id, @Name, @Kind, @Month, @Day, @MovableKey, CAST(@Date AS date), @IsActive, @CreatedAt)", h);

    public Task UpdateAsync(Holiday h, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.holidays
               SET Name = @Name, Month = @Month, Day = @Day, Date = CAST(@Date AS date), IsActive = @IsActive
             WHERE Id = @Id", h);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM landing.holidays WHERE Id = @Id AND Kind = 'extra'", new { Id = id });
}
