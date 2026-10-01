using MediatR;
using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Application.Queries;

public record GetUnreadContactsQuery : IRequest<List<ContactMessage>>;
