namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Registro de una notificación de caducidad ya enviada.
/// Existe para evitar mandar correos duplicados.
/// </summary>
public class DocumentNotification
{
    public Guid Id { get; private set; }
    public Guid DocumentId { get; private set; }
    public int DaysBefore { get; private set; }   // 6 | 3 | 0
    public DateTime NotifiedAt { get; private set; }

    private DocumentNotification() { }

    public static DocumentNotification Create(Guid documentId, int daysBefore) => new()
    {
        Id = Guid.NewGuid(),
        DocumentId = documentId,
        DaysBefore = daysBefore,
        NotifiedAt = DateTime.UtcNow,
    };
}