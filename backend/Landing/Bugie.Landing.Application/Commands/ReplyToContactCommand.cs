using MediatR;
using Bugie.Landing.Application.DTOs;

namespace Bugie.Landing.Application.Commands;

/// <summary>
/// El admin envía una respuesta al correo del remitente.
/// Si SMTP falla, el reply igual se guarda con Status='failed' para
/// que el admin pueda ver el error y reintentar.
/// </summary>
public record ReplyToContactCommand(
    Guid ContactId,
    Guid? AdminUserId,
    string? AdminName,
    string Subject,
    string Body)
    : IRequest<ContactReplyDto>;
