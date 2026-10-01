namespace Bugie.Rewards.Domain.Services;

/// <summary>
/// Cálculos de logros personales. Lógica pura, sin base de datos, para poder
/// verificarla sola.
/// </summary>
public static class MilestoneRules
{
    /// <summary>
    /// Días seguidos viajando que terminan en <paramref name="today"/>.
    ///
    /// Recibe las fechas locales en que el usuario viajó, en cualquier orden y
    /// con repetidos: dos viajes el mismo día cuentan como un día.
    ///
    /// Si hoy no viajó, la racha es 0: la racha se corta, no se arrastra.
    /// </summary>
    public static int CurrentStreak(IEnumerable<DateTime> tripDatesLocal, DateTime today)
    {
        var dias = tripDatesLocal.Select(d => d.Date).ToHashSet();
        var hoy  = today.Date;

        if (!dias.Contains(hoy)) return 0;

        var racha = 0;
        var cursor = hoy;
        while (dias.Contains(cursor))
        {
            racha++;
            cursor = cursor.AddDays(-1);
        }
        return racha;
    }

    /// <summary>
    /// true si la racha completó un bloque entero. Con bloques de 7, se paga a
    /// los 7, 14, 21 días… y no en los días intermedios.
    /// </summary>
    public static bool CompletesStreakBlock(int streak, int blockDays) =>
        blockDays > 0 && streak > 0 && streak % blockDays == 0;

    /// <summary>
    /// Clave de la semana ISO: «2026-W40». Se usa para pagar la meta semanal
    /// una sola vez por semana.
    ///
    /// La semana ISO empieza el lunes, que es como se habla de «esta semana».
    /// </summary>
    public static string WeekKey(DateTime localDate)
    {
        var jueves = localDate.Date.AddDays(3 - ((int)localDate.DayOfWeek + 6) % 7);
        var semana = (jueves.DayOfYear - 1) / 7 + 1;
        return $"{jueves.Year}-W{semana:D2}";
    }

    /// <summary>Lunes de la semana de esa fecha, a las 00:00.</summary>
    public static DateTime WeekStart(DateTime localDate) =>
        localDate.Date.AddDays(-(((int)localDate.DayOfWeek + 6) % 7));

    /// <summary>Clave del mes: «2026-10».</summary>
    public static string MonthKey(DateTime localDate) =>
        $"{localDate.Year}-{localDate.Month:D2}";

    /// <summary>
    /// true si estamos en el mes de aniversario del usuario.
    ///
    /// Se compara solo el MES, no el día: el beneficio dura todo el mes, que
    /// es lo que dice el PDF.
    ///
    /// No aplica el primer mes: sería «aniversario» de alguien que acaba de
    /// llegar, y regalaría el triple de puntos a quien todavía no demostró
    /// nada.
    /// </summary>
    public static bool IsAnniversaryMonth(DateTime joinedLocal, DateTime nowLocal) =>
        joinedLocal.Month == nowLocal.Month && joinedLocal.Year < nowLocal.Year;
}
