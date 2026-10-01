using MediatR;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Queries;

public class GetLandingPageHandler : IRequestHandler<GetLandingPageQuery, LandingPageDto>
{
    private readonly ILandingRepository _repo;
    public GetLandingPageHandler(ILandingRepository repo) => _repo = repo;

    public async Task<LandingPageDto> Handle(GetLandingPageQuery q, CancellationToken ct)
    {
        var sections = await _repo.GetAllSectionsAsync(ct);
        var visible  = sections.Where(s => s.IsVisible).OrderBy(s => s.SortOrder).ToList();

        var result = new List<SectionWithContentDto>();

        foreach (var section in visible)
        {
            // Intenta obtener el idioma pedido; cae a "es" si no existe
            var content = await _repo.GetContentAsync(section.Id, q.Lang, ct)
                       ?? await _repo.GetContentAsync(section.Id, "es", ct);

            if (content is not null)
                result.Add(new SectionWithContentDto(
                    section.Id, section.SectionKey, section.SortOrder, content.ContentJson));
        }

        return new LandingPageDto(q.Lang, result);
    }
}