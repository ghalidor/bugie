using MediatR;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Queries;

public class GetContactMessagesPagedHandler
    : IRequestHandler<GetContactMessagesPagedQuery, ContactMessagesPagedDto>
{
    private readonly IContactRepository _repo;
    public GetContactMessagesPagedHandler(IContactRepository repo) => _repo = repo;

    public async Task<ContactMessagesPagedDto> Handle(
        GetContactMessagesPagedQuery q, CancellationToken ct)
    {
        // Normalización defensiva
        var filter = q.Filter?.ToLowerInvariant() switch
        {
            "unread" => "unread",
            "read" => "read",
            _ => "all"
        };
        var page = q.Page < 1 ? 1 : q.Page;
        var pageSize = q.PageSize < 1 ? 20 : (q.PageSize > 100 ? 100 : q.PageSize);
        var skip = (page - 1) * pageSize;

        var (items, total) = await _repo.GetPagedAsync(filter, skip, pageSize, ct);

        // Para cada mensaje, contamos las respuestas (1 query simple por fila).
        // Si la página tiene 20 filas son 20 queries — barato. Si crece, hacer
        // batch con un IN clause.
        var dtos = new List<ContactMessageItemDto>(items.Count);
        foreach(var m in items)
        {
            var replies = await _repo.GetRepliesByContactAsync(m.Id, ct);
            dtos.Add(new ContactMessageItemDto(
                m.Id, m.Name, m.Email, m.Subject, m.Message,
                m.IsRead, m.CreatedAt, m.ReadAt, m.LastReplyAt, replies.Count));
        }

        var totalPages = (int)Math.Ceiling(total / (double)pageSize);
        return new ContactMessagesPagedDto(page, pageSize, total, totalPages, filter, dtos);
    }
}
