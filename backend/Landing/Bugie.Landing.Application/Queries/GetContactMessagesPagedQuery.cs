using MediatR;
using Bugie.Landing.Application.DTOs;

namespace Bugie.Landing.Application.Queries;

/// <summary>
/// Lista paginada de mensajes de contacto para el admin.
/// filter: 'all' | 'unread' | 'read'. PageSize máx 100.
/// </summary>
public record GetContactMessagesPagedQuery(
    string Filter, int Page, int PageSize)
    : IRequest<ContactMessagesPagedDto>;
