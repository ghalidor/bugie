using MediatR;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Queries;

public class GetUnreadContactsHandler : IRequestHandler<GetUnreadContactsQuery, List<ContactMessage>>
{
    private readonly IContactRepository _contacts;
    public GetUnreadContactsHandler(IContactRepository c) => _contacts = c;

    public Task<List<ContactMessage>> Handle(GetUnreadContactsQuery q, CancellationToken ct) =>
        _contacts.GetUnreadAsync(ct);
}
