namespace Bugie.Landing.Domain.Entities;

/// <summary>
/// Respuesta enviada por un admin a un mensaje de contacto.
/// Una ContactMessage puede tener N ContactReplies.
/// </summary>
public class ContactReply
{
    public Guid Id { get; private set; }
    public Guid ContactId { get; private set; }
    public Guid? AdminUserId { get; private set; }
    public string? AdminName { get; private set; }
    public string Subject { get; private set; } = "";
    public string Body { get; private set; } = "";
    /// <summary>'sent' | 'failed'</summary>
    public string Status { get; private set; } = "sent";
    public string? ErrorMessage { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private ContactReply() { }

    public static ContactReply Create(
        Guid contactId, Guid? adminUserId, string? adminName,
        string subject, string body) => new()
        {
            Id = Guid.NewGuid(),
            ContactId = contactId,
            AdminUserId = adminUserId,
            AdminName = adminName,
            Subject = subject.Trim(),
            Body = body.Trim(),
            Status = "sent",
            CreatedAt = DateTime.UtcNow,
        };

    /// <summary>Marca el envío como fallido (SMTP error, timeout, etc.).</summary>
    public void MarkFailed(string error)
    {
        Status = "failed";
        ErrorMessage = error.Length > 500 ? error.Substring(0, 500) : error;
    }
}
