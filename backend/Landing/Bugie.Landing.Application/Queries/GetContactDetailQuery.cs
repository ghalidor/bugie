using MediatR;
using Bugie.Landing.Application.DTOs;

namespace Bugie.Landing.Application.Queries;

public record GetContactDetailQuery(Guid Id) : IRequest<ContactDetailDto?>;
