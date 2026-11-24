using System.Security.Cryptography;
using System.Text;
using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Services;

/// <summary>Un ganador elegido, con el ticket que salió.</summary>
public record DrawnWinner(Guid UserId, string TicketNumber, int PrizeRank);

/// <summary>
/// El sorteo.
///
/// El PDF dice que los sorteos serán "auditados por blockchain". Montar una
/// blockchain para elegir un ganador es desproporcionado, pero lo que esa
/// frase busca sí se puede dar: que cualquiera pueda comprobar que el ganador
/// no se eligió a dedo.
///
/// Cómo se consigue:
///
///   · El sorteo usa una SEMILLA que se guarda junto al resultado.
///   · A partir de la semilla y de la lista de tickets ordenada, el ganador
///     sale de un cálculo determinista: con los mismos datos, siempre da el
///     mismo resultado.
///   · Como la lista de tickets y la semilla quedan registradas, cualquiera
///     puede repetir el cálculo y verificar el ganador.
///
/// Lo que esto NO evita es que alguien con acceso a la base cambie la semilla
/// antes de sortear. Para cerrar eso habría que publicar el hash de la semilla
/// ANTES del sorteo, por ejemplo en las redes donde el PDF dice que se
/// transmite en vivo. El método PublishableCommitment sirve para eso.
///
/// Es lógica pura: sin base de datos ni red, para poder verificarla sola.
/// </summary>
public static class RaffleDraw
{
    /// <summary>
    /// Genera una semilla al azar. Se guarda en el sorteo y se publica junto
    /// al resultado.
    /// </summary>
    public static string NewSeed() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(16));

    /// <summary>
    /// Compromiso publicable ANTES del sorteo: el hash de la semilla. Al
    /// publicar después la semilla, cualquiera comprueba que es la misma que
    /// se anunció y que no se cambió a conveniencia.
    /// </summary>
    public static string PublishableCommitment(string seed) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed)));

    /// <summary>
    /// Elige los ganadores.
    ///
    /// Reglas:
    ///   · Un usuario no puede ganar dos premios en el mismo sorteo, aunque
    ///     tenga varios tickets. Tener más tickets sí aumenta la probabilidad
    ///     de salir, que es el sentido de los tickets.
    ///   · El puesto 1 es el premio principal.
    ///   · Si hay menos participantes que premios, se entregan los que haya.
    ///
    /// El orden de los tickets se normaliza antes de calcular, para que el
    /// resultado no dependa de cómo los devolvió la base de datos.
    /// </summary>
    public static List<DrawnWinner> Draw(
        IEnumerable<RaffleTicket> tickets, string seed, int winnersCount)
    {
        var ordered = tickets
            .OrderBy(t => t.TicketNumber, StringComparer.Ordinal)
            .ToList();

        if (ordered.Count == 0 || winnersCount <= 0)
            return new List<DrawnWinner>();

        var winners   = new List<DrawnWinner>();
        var yaGanaron = new HashSet<Guid>();

        // Premios que se pueden entregar: nunca más que participantes distintos.
        // Se calcula una sola vez (antes se recalculaba en cada vuelta).
        var objetivo = Math.Min(winnersCount, ordered.Select(t => t.UserId).Distinct().Count());

        // Se recorre una secuencia determinista derivada de la semilla hasta
        // completar los premios. El tope corta el caso extremo (casi todos los
        // tickets de un mismo usuario); el resultado no cambia respecto del
        // cálculo anterior mientras no se llegue al tope.
        for (var round = 0; winners.Count < objetivo && round < MaxRounds; round++)
        {
            var ticket = ordered[DeterministicIndex(seed, round, ordered.Count)];
            if (!yaGanaron.Add(ticket.UserId)) continue;   // ese usuario ya ganó

            winners.Add(new DrawnWinner(ticket.UserId, ticket.TicketNumber, winners.Count + 1));
        }

        // Si se llegó al tope, los premios que faltan van, en orden de ticket,
        // a los primeros participantes que no ganaron: también es determinista
        // y verificable.
        foreach (var ticket in ordered)
        {
            if (winners.Count >= objetivo) break;
            if (yaGanaron.Add(ticket.UserId))
                winners.Add(new DrawnWinner(ticket.UserId, ticket.TicketNumber, winners.Count + 1));
        }

        return winners;
    }

    /// <summary>Tope de vueltas al azar por sorteo.</summary>
    private const int MaxRounds = 100_000;

    /// <summary>
    /// Índice reproducible a partir de la semilla y el número de vuelta.
    /// Mismos datos, mismo índice, siempre.
    /// </summary>
    private static int DeterministicIndex(string seed, int round, int total)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{seed}:{round}"));
        // Se toman 8 bytes y se fuerza positivo antes del módulo.
        var value = BitConverter.ToUInt64(bytes, 0);
        return (int)(value % (ulong)total);
    }

    /// <summary>
    /// Repite el sorteo con los mismos datos. Sirve para que el admin, o
    /// cualquiera con la lista publicada, compruebe el resultado.
    /// </summary>
    public static bool Verify(
        IEnumerable<RaffleTicket> tickets, string seed, int winnersCount,
        IEnumerable<string> expectedTicketNumbers)
    {
        var recalculado = Draw(tickets, seed, winnersCount).Select(w => w.TicketNumber);
        return recalculado.SequenceEqual(expectedTicketNumbers);
    }

    /// <summary>
    /// Número de ticket legible: BG-000123. Se numera por orden de entrega
    /// dentro de cada sorteo.
    /// </summary>
    public static string TicketNumber(int sequence) => $"BG-{sequence:D6}";
}
