using Bugie.Payments.Domain.Entities;

namespace Bugie.Payments.Domain.External;

/// <summary>
/// Avisa al conductor que se le registro un pago (push + correo).
/// Lo envia Rewards, que ya tiene Firebase y correo configurados.
/// Nunca lanza: si falla, el pago igual queda registrado.
/// </summary>
public interface IPayoutNotifier
{
    Task NotifyAsync(Withdrawal payout);
}
