using System.Globalization;
using System.Net;
using MediatR;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Avisa al conductor que Bugie le registro un pago (bono canjeado, premio de
/// sorteo o pago manual): push al celular + correo de constancia.
/// Lo pide Payments al registrar el pago.
/// </summary>
public record NotifyPayoutCommand(
    Guid    UserId,
    decimal Amount,
    string  Method,
    string? OperationNumber,
    string? SourceType,
    string? Note) : IRequest<bool>;

public class NotifyPayoutHandler : IRequestHandler<NotifyPayoutCommand, bool>
{
    private readonly IUserDirectory _users;
    private readonly IFcmSender     _push;
    private readonly IEmailSender   _email;

    public NotifyPayoutHandler(IUserDirectory users, IFcmSender push, IEmailSender email)
        => (_users, _push, _email) = (users, push, email);

    public async Task<bool> Handle(NotifyPayoutCommand cmd, CancellationToken ct)
    {
        var user = (await _users.GetByIdsAsync([cmd.UserId], ct)).GetValueOrDefault(cmd.UserId);
        if (user is null) return false;

        var monto  = $"S/ {cmd.Amount.ToString("0.00", CultureInfo.InvariantCulture)}";
        var metodo = cmd.Method switch
        {
            "yape" => "Yape", "plin" => "Plin",
            "transferencia" => "transferencia", "efectivo" => "efectivo",
            _ => cmd.Method,
        };
        var motivo = cmd.SourceType switch
        {
            "reward_redemption" => "tu bono canjeado con puntos",
            "raffle_prize"      => "tu premio del sorteo",
            _                   => "un pago de Bugie",
        };
        var op = string.IsNullOrWhiteSpace(cmd.OperationNumber) ? "" : $" (op. {cmd.OperationNumber})";

        // Push: al tocarlo abre Ganancias, donde ve el detalle.
        await _push.SendToUserAsync(cmd.UserId, new FcmPushMessage(
            Title: "Bugie te pagó " + monto,
            Body:  $"Te pagamos {motivo} por {metodo}{op}.",
            Route: "/driver/earnings",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "accepted",
                ["type"]       = "payout",
            }), ct);

        // Correo de constancia
        if (!string.IsNullOrWhiteSpace(user.Email))
        {
            var nombre = WebUtility.HtmlEncode(user.FullName ?? "conductor");
            var nota   = string.IsNullOrWhiteSpace(cmd.Note) ? "" :
                $"<tr><td style=\"padding:6px 0;color:#666\">Detalle</td><td style=\"padding:6px 0\">{WebUtility.HtmlEncode(cmd.Note)}</td></tr>";
            var html = $@"<!doctype html><html><head><meta charset=""utf-8""></head>
<body style=""margin:0;background:#f4f6fa;font-family:Arial,sans-serif"">
  <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""padding:20px 0""><tr><td align=""center"">
    <table width=""600"" cellpadding=""0"" cellspacing=""0"" style=""background:#fff;border-radius:12px;overflow:hidden"">
      <tr><td style=""background:#4F7DF5;padding:24px;text-align:center;color:#fff;font-size:26px;font-weight:bold"">Bugie</td></tr>
      <tr><td style=""padding:28px;color:#333;font-size:15px;line-height:1.6"">
        <h2 style=""margin:0 0 16px;color:#4F7DF5"">Te registramos un pago</h2>
        <p>Hola <strong>{nombre}</strong>,</p>
        <p>Te pagamos {motivo}. Estos son los datos:</p>
        <table cellpadding=""0"" cellspacing=""0"" style=""width:100%;font-size:15px"">
          <tr><td style=""padding:6px 0;color:#666"">Monto</td><td style=""padding:6px 0""><strong>{monto}</strong></td></tr>
          <tr><td style=""padding:6px 0;color:#666"">Método</td><td style=""padding:6px 0"">{metodo}</td></tr>
          {(string.IsNullOrWhiteSpace(cmd.OperationNumber) ? "" : $@"<tr><td style=""padding:6px 0;color:#666"">N.º de operación</td><td style=""padding:6px 0"">{WebUtility.HtmlEncode(cmd.OperationNumber)}</td></tr>")}
          {nota}
        </table>
        <p style=""margin-top:20px"">Puedes ver todos tus pagos en <strong>Ganancias</strong>, dentro de la app.</p>
      </td></tr>
      <tr><td style=""background:#f4f6fa;padding:16px;text-align:center;color:#888;font-size:12px"">Este es un correo automático, por favor no lo respondas.</td></tr>
    </table>
  </td></tr></table>
</body></html>";
            await _email.SendAsync(user.Email, $"Bugie · Te pagamos {monto}", html, ct);
        }
        return true;
    }
}
