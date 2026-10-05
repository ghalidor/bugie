using System.Globalization;
using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Common;

/// <summary>
/// Dias habiles para el Libro de Reclamaciones: lunes a viernes, sin los
/// feriados activos (fijos del anio, moviles calculados y extras).
/// Trabaja con fechas de Peru (BugieTime.Today), sin hora.
/// </summary>
public class BusinessDays
{
    private readonly List<Holiday> _holidays;
    private readonly Dictionary<int, HashSet<DateTime>> _byYear = new();

    /// <param name="holidays">Feriados; los inactivos se ignoran.</param>
    public BusinessDays(IEnumerable<Holiday> holidays)
        => _holidays = holidays.Where(h => h.IsActive).ToList();

    public bool IsHoliday(DateTime day)
    {
        day = day.Date;
        if(!_byYear.TryGetValue(day.Year, out var set))
        {
            set = HolidayDates.ForYear(_holidays, day.Year).Select(x => x.Date).ToHashSet();
            _byYear[day.Year] = set;
        }
        return set.Contains(day);
    }

    public bool IsBusinessDay(DateTime day) =>
        day.DayOfWeek != DayOfWeek.Saturday && day.DayOfWeek != DayOfWeek.Sunday && !IsHoliday(day);

    /// <summary>
    /// Suma n dias habiles a una fecha. El dia de partida no cuenta:
    /// un reclamo del viernes empieza a contar el lunes.
    /// </summary>
    public DateTime Add(DateTime start, int days)
    {
        var d = start.Date;
        var added = 0;
        while(added < days)
        {
            d = d.AddDays(1);
            if(IsBusinessDay(d)) added++;
        }
        return d;
    }

    /// <summary>
    /// Dias habiles que quedan desde hoy hasta la fecha limite (incluida).
    /// 0 = vence hoy. Negativo = vencido (dias habiles de atraso).
    /// </summary>
    public int Remaining(DateTime today, DateTime due)
    {
        today = today.Date; due = due.Date;
        if(due == today) return 0;
        var sign = due > today ? 1 : -1;
        var count = 0;
        for(var d = today; d != due;)
        {
            d = d.AddDays(sign);
            if(IsBusinessDay(d)) count++;
        }
        return sign * count;
    }
}

/// <summary>Fechas concretas de los feriados en un anio.</summary>
public static class HolidayDates
{
    /// <summary>Domingo de Pascua (calendario gregoriano, algoritmo de Meeus/Jones/Butcher).</summary>
    public static DateTime EasterSunday(int year)
    {
        int a = year % 19, b = year / 100, c = year % 100;
        int d = b / 4, e = b % 4, f = (b + 8) / 25, g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = (h + l - 7 * m + 114) % 31 + 1;
        return new DateTime(year, month, day);
    }

    /// <summary>Fecha del feriado en ese anio; null si no cae en ese anio.</summary>
    public static DateTime? Resolve(Holiday h, int year)
    {
        switch(h.Kind)
        {
            case Holiday.Fixed:
                if(h.Month is not int mo || h.Day is not int dd || mo < 1 || mo > 12) return null;
                // 29 de febrero solo existe en anios bisiestos.
                return dd >= 1 && dd <= DateTime.DaysInMonth(year, mo) ? new DateTime(year, mo, dd) : null;
            case Holiday.Movable:
                var easter = EasterSunday(year);
                return h.MovableKey switch
                {
                    Holiday.HolyThursday => easter.AddDays(-3),
                    Holiday.GoodFriday => easter.AddDays(-2),
                    _ => null,
                };
            case Holiday.Extra:
                return DateTime.TryParseExact(h.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                           DateTimeStyles.None, out var date) && date.Year == year
                    ? date : null;
            default:
                return null;
        }
    }

    /// <summary>Feriados que caen en ese anio, ordenados por fecha.</summary>
    public static List<(DateTime Date, Holiday Holiday)> ForYear(IEnumerable<Holiday> holidays, int year) =>
        holidays
            .Select(h => (Date: Resolve(h, year), Holiday: h))
            .Where(x => x.Date is not null)
            .Select(x => (x.Date!.Value, x.Holiday))
            .OrderBy(x => x.Value)
            .ToList();
}
