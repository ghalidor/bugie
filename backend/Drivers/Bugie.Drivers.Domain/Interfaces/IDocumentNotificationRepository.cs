using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IDocumentNotificationRepository
{
    Task<bool> ExistsAsync(Guid documentId, int daysBefore, CancellationToken ct = default);
    Task AddAsync(DocumentNotification notification, CancellationToken ct = default);
}