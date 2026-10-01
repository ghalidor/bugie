using Bugie.Rewards.Domain.Constants;

namespace Bugie.Rewards.Domain.Entities;

/// <summary>
/// Saldo de puntos de un usuario. Hay exactamente uno por usuario.
/// </summary>
public class PointsProfile
{
    public Guid      Id               { get; private set; }
    public Guid      UserId           { get; private set; }
    public string    UserType         { get; private set; } = UserTypes.Passenger;

    /// <summary>Suma historica de todo lo ganado. Nunca baja.</summary>
    public int       TotalPoints      { get; private set; }

    /// <summary>Puntos que el usuario puede canjear hoy.</summary>
    public int       AvailablePoints  { get; private set; }

    /// <summary>Suma historica de lo canjeado.</summary>
    public int       RedeemedPoints   { get; private set; }

    public string    CurrentLevel     { get; private set; } = "bronze";

    /// <summary>Fecha en que vence TODO el saldo. Se renueva en cada acumulacion.</summary>
    public DateTime? PointsExpiryDate { get; private set; }

    public DateTime? LastActivityDate { get; private set; }

    /// <summary>
    /// Fecha de vencimiento para la que ya se mando el aviso push.
    /// Si el usuario gana puntos, PointsExpiryDate cambia y este queda
    /// desfasado: asi sabemos que toca avisar de nuevo.
    /// </summary>
    public DateTime? ExpiryWarningSentFor { get; private set; }

    /// <summary>
    /// Ultimo hito de aviso ya enviado para esa fecha (30, 7, 1...).
    /// Null si todavia no se aviso nada para la fecha vigente.
    /// </summary>
    public int? ExpiryWarningLastMilestone { get; private set; }
    public DateTime  CreatedAt        { get; private set; }
    public DateTime  UpdatedAt        { get; private set; }

    private PointsProfile() { }

    public static PointsProfile Create(Guid userId, string userType)
    {
        if (userId == Guid.Empty)
            throw new ArgumentException("UserId requerido.", nameof(userId));
        if (!UserTypes.IsValid(userType))
            throw new ArgumentException($"UserType invalido: {userType}", nameof(userType));

        var now = DateTime.UtcNow;
        return new PointsProfile
        {
            Id           = Guid.NewGuid(),
            UserId       = userId,
            UserType     = userType,
            CurrentLevel = "bronze",
            CreatedAt    = now,
            UpdatedAt    = now,
        };
    }

    /// <summary>
    /// Acredita puntos y renueva la vigencia de TODO el saldo.
    /// Esto es lo que hace que un usuario activo nunca pierda sus puntos.
    /// </summary>
    public void Earn(int points, int expiryMonths)
    {
        if (points <= 0)
            throw new ArgumentOutOfRangeException(nameof(points), "Los puntos deben ser positivos.");
        if (expiryMonths <= 0)
            throw new ArgumentOutOfRangeException(nameof(expiryMonths), "La vigencia debe ser positiva.");

        var now = DateTime.UtcNow;
        TotalPoints      += points;
        AvailablePoints  += points;
        LastActivityDate  = now;
        PointsExpiryDate  = now.AddMonths(expiryMonths);
        UpdatedAt         = now;
    }

    /// <summary>
    /// Descuenta puntos por un canje.
    /// Ojo: canjear NO renueva la vigencia. Solo ganar puntos la renueva.
    /// TotalPoints tampoco baja: es el historico de lo ganado.
    /// </summary>
    public void Redeem(int points)
    {
        if (points <= 0)
            throw new ArgumentOutOfRangeException(nameof(points), "Los puntos deben ser positivos.");
        if (points > AvailablePoints)
            throw new InvalidOperationException("Saldo de puntos insuficiente.");

        AvailablePoints -= points;
        RedeemedPoints  += points;
        UpdatedAt        = DateTime.UtcNow;
    }

    /// <summary>
    /// Devuelve puntos de un canje anulado. No renueva la vigencia:
    /// los puntos vuelven con la fecha de vencimiento que ya tenian.
    /// </summary>
    public void RefundRedemption(int points)
    {
        if (points <= 0)
            throw new ArgumentOutOfRangeException(nameof(points), "Los puntos deben ser positivos.");

        AvailablePoints += points;
        RedeemedPoints   = Math.Max(0, RedeemedPoints - points);
        UpdatedAt        = DateTime.UtcNow;
    }

    /// <summary>
    /// Vence todo el saldo disponible. Devuelve cuantos puntos se perdieron.
    ///
    /// TotalPoints no se toca: sigue siendo el historico de lo ganado.
    /// RedeemedPoints tampoco: los puntos vencidos no se canjearon.
    /// </summary>
    public int ExpireAll()
    {
        var lost = AvailablePoints;
        if (lost <= 0) return 0;

        AvailablePoints            = 0;
        PointsExpiryDate           = null;
        ExpiryWarningSentFor       = null;
        ExpiryWarningLastMilestone = null;
        UpdatedAt            = DateTime.UtcNow;
        return lost;
    }

    /// <summary>Deja constancia del hito avisado para la fecha vigente.</summary>
    public void MarkExpiryWarningSent(int milestoneDays)
    {
        ExpiryWarningSentFor       = PointsExpiryDate;
        ExpiryWarningLastMilestone = milestoneDays;
        UpdatedAt                  = DateTime.UtcNow;
    }

    /// <summary>Dias que faltan para que venza el saldo. 0 si ya vencio.</summary>
    public int DaysUntilExpiry()
    {
        if (PointsExpiryDate is null) return int.MaxValue;
        var days = (PointsExpiryDate.Value - DateTime.UtcNow).TotalDays;
        return days <= 0 ? 0 : (int)Math.Ceiling(days);
    }

    /// <summary>
    /// Devuelve el hito de aviso que corresponde mandar ahora, o null si no
    /// toca ninguno.
    ///
    /// Con hitos 30, 7 y 1:
    ///   - faltan 25 dias -> corresponde el hito 30
    ///   - faltan 5 dias  -> corresponde el hito 7
    ///   - faltan 1 dia   -> corresponde el hito 1
    ///
    /// Solo se avisa si ese hito todavia no se envio. Y si el usuario gana
    /// puntos, PointsExpiryDate cambia, los hitos se reinician y vuelve a
    /// empezar el ciclo con la fecha nueva.
    /// </summary>
    public int? NextExpiryWarningMilestone(IReadOnlyCollection<int> milestones)
    {
        if (AvailablePoints <= 0 || PointsExpiryDate is null) return null;
        if (milestones is null || milestones.Count == 0) return null;

        var daysLeft = DaysUntilExpiry();
        if (daysLeft <= 0) return null;   // ya vencio, le toca vencer, no avisar

        // El hito mas cercano entre los que ya alcanzo.
        var candidates = milestones.Where(m => m > 0 && m >= daysLeft).ToList();
        if (candidates.Count == 0) return null;   // todavia falta mucho
        var current = candidates.Min();

        // Si la fecha cambio (el usuario gano puntos), los avisos se reinician.
        var alreadySent = ExpiryWarningSentFor == PointsExpiryDate
            ? ExpiryWarningLastMilestone
            : null;

        if (alreadySent is null) return current;
        return current < alreadySent ? current : null;
    }

    public void SetLevel(string levelName)
    {
        if (string.IsNullOrWhiteSpace(levelName)) return;
        if (CurrentLevel == levelName) return;
        CurrentLevel = levelName;
        UpdatedAt    = DateTime.UtcNow;
    }

    /// <summary>Puntos con los que se compara contra los umbrales de nivel.</summary>
    public int PointsForLevel(string basis) =>
        basis == LevelBasis.Available ? AvailablePoints : TotalPoints;
}
