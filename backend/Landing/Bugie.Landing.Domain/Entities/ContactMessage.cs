namespace Bugie.Landing.Domain.Entities;

public class ContactMessage
{
    public Guid Id { get; private set; }
    public string Name { get; private set; } = "";
    public string Email { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string Message { get; private set; } = "";
    public bool IsRead { get; private set; }
    public DateTime CreatedAt { get; private set; }
    // Columnas agregadas en migración 006_ContactReplies.sql
    public DateTime? ReadAt { get; private set; }
    public Guid? ReadByUserId { get; private set; }
    public DateTime? LastReplyAt { get; private set; }

    private ContactMessage() { }

    public static ContactMessage Create(string name, string email,
                                         string subject, string message) => new()
                                         {
                                             Id = Guid.NewGuid(),
                                             Name = name.Trim(),
                                             Email = email.ToLowerInvariant().Trim(),
                                             Subject = subject,
                                             Message = message.Trim(),
                                             IsRead = false,
                                             CreatedAt = DateTime.UtcNow,
                                         };
}