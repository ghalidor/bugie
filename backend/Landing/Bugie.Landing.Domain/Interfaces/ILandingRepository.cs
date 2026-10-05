using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

public interface ILandingRepository
{
    Task<List<LandingSection>>  GetAllSectionsAsync(CancellationToken ct = default);
    Task<LandingSection?>       GetSectionByKeyAsync(string key, CancellationToken ct = default);
    Task<SectionContent?>       GetContentAsync(Guid sectionId, string lang, CancellationToken ct = default);
    Task<List<SectionContent>>  GetAllContentAsync(string lang, CancellationToken ct = default);
    Task                        AddContentAsync(SectionContent content, CancellationToken ct = default);
    Task                        UpdateSectionAsync(LandingSection section, CancellationToken ct = default);
    Task                        UpdateContentAsync(SectionContent content, CancellationToken ct = default);
}