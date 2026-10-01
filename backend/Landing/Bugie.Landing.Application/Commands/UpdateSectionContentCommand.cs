using MediatR;
using Bugie.Landing.Application.DTOs;

namespace Bugie.Landing.Application.Commands;

public record UpdateSectionContentCommand(string SectionKey, string Lang, string ContentJson)
    : IRequest<SectionContentDto>;