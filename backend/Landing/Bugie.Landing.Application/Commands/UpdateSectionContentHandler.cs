using MediatR;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public class UpdateSectionContentHandler : IRequestHandler<UpdateSectionContentCommand, SectionContentDto>
{
    private readonly ILandingRepository _repo;
    public UpdateSectionContentHandler(ILandingRepository repo) => _repo = repo;

    public async Task<SectionContentDto> Handle(UpdateSectionContentCommand cmd, CancellationToken ct)
    {
        var section = await _repo.GetSectionByKeyAsync(cmd.SectionKey, ct)
            ?? throw new KeyNotFoundException($"Sección '{cmd.SectionKey}' no encontrada.");

        var existing = await _repo.GetContentAsync(section.Id, cmd.Lang, ct);

        if (existing is null)
        {
            var newContent = SectionContent.Create(section.Id, cmd.Lang, cmd.ContentJson);
            await _repo.AddContentAsync(newContent, ct);
            return new SectionContentDto(newContent.Id, newContent.SectionId,
                newContent.Lang, newContent.ContentJson, newContent.UpdatedAt);
        }

        existing.Update(cmd.ContentJson);
        await _repo.UpdateContentAsync(existing, ct);
        section.Touch();
        await _repo.UpdateSectionAsync(section, ct);

        return new SectionContentDto(existing.Id, existing.SectionId,
            existing.Lang, existing.ContentJson, existing.UpdatedAt);
    }
}