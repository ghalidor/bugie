namespace Bugie.Landing.Application.DTOs;

public record ContactMessageItemDto(
    Guid Id,
    string Name,
    string Email,
    string Subject,
    string Message,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt,
    DateTime? LastReplyAt,
    int RepliesCount);

public record ContactMessagesPagedDto(
    int Page,
    int PageSize,
    int Total,
    int TotalPages,
    string Filter,
    IReadOnlyList<ContactMessageItemDto> Items);

public record ContactReplyDto(
    Guid Id,
    Guid? AdminUserId,
    string? AdminName,
    string Subject,
    string Body,
    string Status,
    string? ErrorMessage,
    DateTime CreatedAt);

public record ContactDetailDto(
    Guid Id,
    string Name,
    string Email,
    string Subject,
    string Message,
    bool IsRead,
    DateTime CreatedAt,
    DateTime? ReadAt,
    DateTime? LastReplyAt,
    IReadOnlyList<ContactReplyDto> Replies);
