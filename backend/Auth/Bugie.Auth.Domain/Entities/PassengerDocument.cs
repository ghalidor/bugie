namespace Bugie.Auth.Domain.Entities;

public class PassengerDocument {
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string DocType { get; private set; }   // dni_front | dni_back
    public string FileUrl { get; private set; }
    public string? StorageFileId { get; private set; }
    public string? OriginalFileName { get; private set; }
    public string? MimeType { get; private set; }
    public long? SizeBytes { get; private set; }
    public string Status { get; private set; }   // pending | approved | rejected
    public string? RejectionReason { get; private set; }
    public DateTime? ReviewedAt { get; private set; }
    public Guid? ReviewedBy { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private PassengerDocument() { }

    public static PassengerDocument Create(
        Guid userId, string docType, string fileUrl,
        string storageFileId, string originalFileName, string mimeType, long sizeBytes) => new() {
            Id = Guid.NewGuid(),
            UserId = userId,
            DocType = docType,
            FileUrl = fileUrl,
            StorageFileId = storageFileId,
            OriginalFileName = originalFileName,
            MimeType = mimeType,
            SizeBytes = sizeBytes,
            Status = "pending",
            CreatedAt = DateTime.UtcNow,
        };

    public void Approve(Guid reviewedBy) {
        Status = "approved";
        ReviewedAt = DateTime.UtcNow;
        ReviewedBy = reviewedBy;
        RejectionReason = null;
    }

    public void Reject(Guid reviewedBy, string? reason) {
        Status = "rejected";
        ReviewedAt = DateTime.UtcNow;
        ReviewedBy = reviewedBy;
        RejectionReason = reason;
    }

    public void UpdateFile(string fileUrl, string storageFileId,
                            string originalFileName, string mimeType, long sizeBytes) {
        FileUrl = fileUrl;
        StorageFileId = storageFileId;
        OriginalFileName = originalFileName;
        MimeType = mimeType;
        SizeBytes = sizeBytes;
        Status = "pending";
        ReviewedAt = null;
        ReviewedBy = null;
        RejectionReason = null;
    }
}