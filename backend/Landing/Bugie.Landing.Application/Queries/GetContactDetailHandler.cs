using MediatR;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Queries;

public class GetContactDetailHandler
    : IRequestHandler<GetContactDetailQuery, ContactDetailDto?>
{
    private readonly IContactRepository _repo;
    public GetContactDetailHandler(IContactRepository repo) => _repo = repo;

    public async Task<ContactDetailDto?> Handle(
        GetContactDetailQuery q, CancellationToken ct)
    {
        var msg = await _repo.GetByIdAsync(q.Id, ct);
        if(msg is null) return null;

        var replies = await _repo.GetRepliesByContactAsync(q.Id, ct);
        var dtos = replies.Select(r => new ContactReplyDto(
            r.Id, r.AdminUserId, r.AdminName, r.Subject, r.Body,
            r.Status, r.ErrorMessage, r.CreatedAt
        )).ToList();

        return new ContactDetailDto(
            msg.Id, msg.Name, msg.Email, msg.Subject, msg.Message,
            msg.IsRead, msg.CreatedAt, msg.ReadAt, msg.LastReplyAt, dtos);
    }
}
