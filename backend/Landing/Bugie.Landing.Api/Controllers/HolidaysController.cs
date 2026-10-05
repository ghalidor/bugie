using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Api.Controllers;

/// <summary>
/// Feriados que no cuentan como dias habiles (plazos del Libro de Reclamaciones).
///   GET    /api/landing/admin/holidays              todos (con su fecha en el anio actual)
///   GET    /api/landing/admin/holidays/year/{year}  feriados de ese anio con fecha resuelta
///   POST   /api/landing/admin/holidays              crea un 'fijo' o un 'extra'
///   PUT    /api/landing/admin/holidays/{id}         edita nombre y fecha (moviles: solo nombre)
///   PUT    /api/landing/admin/holidays/{id}/active  activa / desactiva
///   DELETE /api/landing/admin/holidays/{id}         solo 'extra' (fijos y moviles se desactivan)
/// </summary>
[ApiController]
[Route("api/landing/admin/holidays")]
[Authorize(Roles = "admin")]
// Feriados: seccion de la pagina Configuracion.
[RequirePermission(Perm.ViewSettings)]
public class HolidaysController : ControllerBase
{
    private readonly IHolidayRepository _repo;
    public HolidaysController(IHolidayRepository repo) => _repo = repo;

    private static string Day(DateTime d) => d.ToString("yyyy-MM-dd");

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var year = BugieTime.Today.Year;
        var list = await _repo.GetAllAsync(ct);
        return Ok(list.Select(h => ToDto(h, year)));
    }

    [HttpGet("year/{year:int}")]
    public async Task<IActionResult> GetYear(int year, CancellationToken ct)
    {
        if(year < 2000 || year > 2100) return BadRequest(new { error = "El año debe estar entre 2000 y 2100." });
        var list = await _repo.GetAllAsync(ct);
        return Ok(HolidayDates.ForYear(list, year).Select(x => new
        {
            date = Day(x.Date),
            name = x.Holiday.Name,
            kind = x.Holiday.Kind,
            holidayId = x.Holiday.Id,
            isActive = x.Holiday.IsActive,
            // Cae en fin de semana: igual no es dia habil.
            isWeekend = x.Date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday,
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] HolidayRequest req, CancellationToken ct)
    {
        var kind = (req.Kind ?? "").Trim().ToLowerInvariant();
        if(kind is not (Holiday.Fixed or Holiday.Extra))
            return BadRequest(new { error = "Solo puedes agregar feriados fijos (cada año) o extra (una fecha)." });

        var h = new Holiday
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            IsActive = req.IsActive ?? true,
            CreatedAt = DateTime.UtcNow,
        };
        var error = Apply(h, req);
        if(error is not null) return BadRequest(new { error });
        if(await _repo.ExistsSameDayAsync(h, ct))
            return Conflict(new { error = "Ya existe un feriado en esa fecha." });

        await _repo.AddAsync(h, ct);
        return Ok(ToDto(h, BugieTime.Today.Year));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] HolidayRequest req, CancellationToken ct)
    {
        var h = await _repo.GetByIdAsync(id, ct);
        if(h is null) return NotFound(new { error = "Feriado no encontrado." });

        var error = Apply(h, req);
        if(error is not null) return BadRequest(new { error });
        if(await _repo.ExistsSameDayAsync(h, ct))
            return Conflict(new { error = "Ya existe un feriado en esa fecha." });

        await _repo.UpdateAsync(h, ct);
        return Ok(ToDto(h, BugieTime.Today.Year));
    }

    [HttpPut("{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] HolidayActiveRequest req, CancellationToken ct)
    {
        var h = await _repo.GetByIdAsync(id, ct);
        if(h is null) return NotFound(new { error = "Feriado no encontrado." });
        h.IsActive = req.IsActive;
        await _repo.UpdateAsync(h, ct);
        return Ok(ToDto(h, BugieTime.Today.Year));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var h = await _repo.GetByIdAsync(id, ct);
        if(h is null) return NotFound(new { error = "Feriado no encontrado." });
        if(h.Kind != Holiday.Extra)
            return Conflict(new { error = "Los feriados fijos y móviles no se borran: desactívalos." });
        await _repo.DeleteAsync(id, ct);
        return Ok(new { deleted = true });
    }

    /// <summary>Copia nombre y fecha segun el tipo. Devuelve el error o null.</summary>
    private static string? Apply(Holiday h, HolidayRequest req)
    {
        var name = (req.Name ?? "").Trim();
        if(name.Length == 0) return "Escribe el nombre del feriado.";
        if(name.Length > 100) return "El nombre admite como máximo 100 caracteres.";
        h.Name = name;

        switch(h.Kind)
        {
            case Holiday.Fixed:
                if(req.Month is not int m || m < 1 || m > 12) return "Elige el mes.";
                // 2024 es bisiesto: permite el 29 de febrero (solo cuenta en anios bisiestos).
                if(req.Day is not int d || d < 1 || d > DateTime.DaysInMonth(2024, m)) return "El día no es válido para ese mes.";
                h.Month = m; h.Day = d;
                break;
            case Holiday.Extra:
                if(!DateTime.TryParseExact((req.Date ?? "").Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                       DateTimeStyles.None, out var date))
                    return "Elige una fecha válida.";
                h.Date = Day(date);
                break;
            // Movil: la fecha se calcula desde la Pascua; solo se cambia el nombre.
        }
        return null;
    }

    private static object ToDto(Holiday h, int year) => new
    {
        id = h.Id,
        name = h.Name,
        kind = h.Kind,
        month = h.Month,
        day = h.Day,
        movable = h.MovableKey,
        date = h.Date,
        isActive = h.IsActive,
        createdAt = h.CreatedAt,
        // Fecha en el anio actual (para mostrar los moviles); null si no cae ese anio.
        currentYearDate = HolidayDates.Resolve(h, year) is DateTime d ? Day(d) : null,
    };
}

public record HolidayRequest(string? Name, string? Kind, int? Month, int? Day, string? Date, bool? IsActive);
public record HolidayActiveRequest(bool IsActive);
