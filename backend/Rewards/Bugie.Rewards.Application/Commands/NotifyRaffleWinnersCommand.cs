using System.Globalization;
using System.Net;
using MediatR;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Avisa a los ganadores de un sorteo ya ejecutado: push (que además queda en
/// la bandeja de notificaciones de la app, ver FcmSender) + correo con el
/// premio, el código PZ y cómo cobrarlo.
///
/// Lo llaman el mantenimiento diario y "Sortear ahora". Nunca lanza: el sorteo
/// ya quedó guardado y un aviso que no sale no puede deshacerlo. El push y el
/// correo registran sus propios fallos en el log. Devuelve a cuántos ganadores
/// se les intentó avisar.
/// </summary>
public record NotifyRaffleWinnersCommand(Guid RaffleId) : IRequest<int>;

public class NotifyRaffleWinnersHandler : IRequestHandler<NotifyRaffleWinnersCommand, int>
{
    private readonly IRaffleRepository _raffles;
    private readonly IUserDirectory    _users;
    private readonly IFcmSender        _push;
    private readonly IEmailSender      _email;

    public NotifyRaffleWinnersHandler(
        IRaffleRepository raffles, IUserDirectory users, IFcmSender push, IEmailSender email)
        => (_raffles, _users, _push, _email) = (raffles, users, push, email);

    public async Task<int> Handle(NotifyRaffleWinnersCommand cmd, CancellationToken ct)
    {
        try
        {
            var raffle = await _raffles.GetByIdAsync(cmd.RaffleId, ct);
            if (raffle is null) return 0;

            // Se releen de la base: el código PZ lo genera la base al guardar.
            var winners = await _raffles.GetWinnersAsync(cmd.RaffleId, ct);
            if (winners.Count == 0) return 0;

            var users = await _users.GetByIdsAsync(winners.Select(w => w.UserId), ct);
            var avisados = 0;

            foreach (var w in winners)
            {
                try
                {
                    var user      = users.GetValueOrDefault(w.UserId);
                    var conductor = user?.Role == "driver";
                    var premio    = string.IsNullOrWhiteSpace(w.PrizeDetail) ? raffle.PrizeDescription : w.PrizeDetail!;
                    var codigo    = w.PrizeCode ?? "";

                    await _push.SendToUserAsync(w.UserId, new FcmPushMessage(
                        Title: $"¡Ganaste el sorteo {raffle.Name}!",
                        Body:  conductor
                            ? $"Premio: {premio}. Tu código para cobrarlo es {codigo}."
                            : $"Premio: {premio}. Tu código es {codigo}; te contactaremos para la entrega.",
                        Route: "/rewards?tab=promos",
                        ExtraData: new Dictionary<string, string>
                        {
                            ["type"]       = "raffle_won",
                            ["tab"]        = "promos",
                            ["raffle_id"]  = raffle.Id.ToString(),
                            ["winner_id"]  = w.Id.ToString(),
                            ["prize_code"] = codigo,
                        }), ct);

                    if (!string.IsNullOrWhiteSpace(user?.Email))
                        await _email.SendAsync(user!.Email!,
                            $"Bugie · ¡Ganaste el sorteo {raffle.Name}!",
                            BuildEmail(user.FullName, raffle.Name, premio, raffle.PrizeValue,
                                       w.PrizeRank, w.TicketNumber, codigo, conductor), ct);

                    avisados++;
                }
                catch
                {
                    // Un ganador que falla no impide avisar a los demás.
                }
            }
            return avisados;
        }
        catch
        {
            return 0;
        }
    }

    private static string BuildEmail(
        string? fullName, string sorteo, string premio, decimal? valor,
        int puesto, string ticket, string codigo, bool conductor)
    {
        var nombre = WebUtility.HtmlEncode(fullName ?? (conductor ? "conductor" : "pasajero"));
        var valorFila = valor is > 0
            ? $@"<tr><td style=""padding:6px 0;color:#666"">Valor aprox.</td><td style=""padding:6px 0"">S/ {valor.Value.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>"
            : "";
        var puestoFila = puesto > 1
            ? $@"<tr><td style=""padding:6px 0;color:#666"">Puesto</td><td style=""padding:6px 0"">{puesto}.º ganador</td></tr>"
            : "";
        var comoCobrar = conductor
            ? "Para cobrarlo, comunícate con el equipo de Bugie y da tu código de premio: el administrador registra el pago con ese código y te avisamos apenas esté hecho."
            : "Nuestro equipo se comunicará contigo para coordinar la entrega de tu premio. Ten a la mano tu código de premio.";

        return $@"<!doctype html><html><head><meta charset=""utf-8""></head>
<body style=""margin:0;background:#f4f6fa;font-family:Arial,sans-serif"">
  <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""padding:20px 0""><tr><td align=""center"">
    <table width=""600"" cellpadding=""0"" cellspacing=""0"" style=""background:#fff;border-radius:12px;overflow:hidden"">
      <tr><td style=""background:#4F7DF5;padding:24px;text-align:center;color:#fff;font-size:26px;font-weight:bold"">Bugie</td></tr>
      <tr><td style=""padding:28px;color:#333;font-size:15px;line-height:1.6"">
        <h2 style=""margin:0 0 16px;color:#4F7DF5"">¡Ganaste el sorteo!</h2>
        <p>Hola <strong>{nombre}</strong>,</p>
        <p>Tu ticket salió ganador en el sorteo <strong>{WebUtility.HtmlEncode(sorteo)}</strong>. Estos son los datos de tu premio:</p>
        <table cellpadding=""0"" cellspacing=""0"" style=""width:100%;font-size:15px"">
          <tr><td style=""padding:6px 0;color:#666"">Premio</td><td style=""padding:6px 0""><strong>{WebUtility.HtmlEncode(premio)}</strong></td></tr>
          {valorFila}
          {puestoFila}
          <tr><td style=""padding:6px 0;color:#666"">Ticket ganador</td><td style=""padding:6px 0"">{WebUtility.HtmlEncode(ticket)}</td></tr>
          <tr><td style=""padding:6px 0;color:#666"">Código de premio</td><td style=""padding:6px 0""><strong style=""font-size:18px;letter-spacing:1px"">{WebUtility.HtmlEncode(codigo)}</strong></td></tr>
        </table>
        <p style=""margin-top:20px""><strong>¿Cómo lo cobro?</strong><br>{comoCobrar}</p>
        <p>También puedes ver tu premio en <strong>Puntos › Promos y sorteos</strong>, dentro de la app.</p>
      </td></tr>
      <tr><td style=""background:#f4f6fa;padding:16px;text-align:center;color:#888;font-size:12px"">Este es un correo automático, por favor no lo respondas.</td></tr>
    </table>
  </td></tr></table>
</body></html>";
    }
}
