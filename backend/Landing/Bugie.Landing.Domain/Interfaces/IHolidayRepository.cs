using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

/// <summary>Feriados (landing.holidays).</summary>
public interface IHolidayRepository
{
    Task<List<Holiday>> GetAllAsync(CancellationToken ct = default);
    Task<Holiday?> GetByIdAsync(Guid id, CancellationToken ct = default);
    /// <summary>Otro feriado igual (fijo con el mismo mes/dia o extra con la misma fecha).</summary>
    Task<bool> ExistsSameDayAsync(Holiday h, CancellationToken ct = default);
    Task AddAsync(Holiday h, CancellationToken ct = default);
    /// <summary>Guarda nombre, mes/dia, fecha y activo.</summary>
    Task UpdateAsync(Holiday h, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}
