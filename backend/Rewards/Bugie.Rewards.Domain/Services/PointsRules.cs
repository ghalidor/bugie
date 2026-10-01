using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Services;

/// <summary>
/// Reglas puras de calculo. Sin base de datos, sin HTTP: solo aritmetica.
/// Por eso es facil de probar y de cambiar.
/// </summary>
public static class PointsRules
{
    /// <summary>
    /// Puntos que genera un monto de dinero segun la tasa configurada.
    /// Se trunca hacia abajo: S/. 8.75 x 10 = 87 puntos, no 87.5.
    /// </summary>
    public static int FromAmount(decimal amount, decimal rate)
    {
        if (amount <= 0 || rate <= 0) return 0;
        return (int)Math.Floor(amount * rate);
    }

    /// <summary>
    /// Devuelve el nivel que corresponde a una cantidad de puntos.
    /// Toma el nivel activo con el MinPoints mas alto que el usuario alcanza.
    /// Si no hay ninguno configurado, devuelve null.
    /// </summary>
    public static RewardLevel? ResolveLevel(IEnumerable<RewardLevel> levels, int points)
    {
        return levels
            .Where(l => l.IsActive && points >= l.MinPoints)
            .OrderByDescending(l => l.MinPoints)
            .FirstOrDefault();
    }

    /// <summary>
    /// Devuelve el siguiente nivel al que puede subir el usuario, o null si ya
    /// esta en el mas alto.
    /// </summary>
    public static RewardLevel? ResolveNextLevel(IEnumerable<RewardLevel> levels, int points)
    {
        return levels
            .Where(l => l.IsActive && l.MinPoints > points)
            .OrderBy(l => l.MinPoints)
            .FirstOrDefault();
    }
}
