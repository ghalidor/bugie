namespace Bugie.Landing.Domain.Entities;

/// <summary>
/// Sección de la landing (hero, features, stats, testimonials, cta, etc.)
/// Cada sección tiene contenido por idioma (i18n).
/// </summary>
public class LandingSection
{
    public Guid     Id         { get; private set; }
    public string   SectionKey { get; private set; }  // hero | features | stats | testimonials | cta
    public int      SortOrder  { get; private set; }
    public bool     IsVisible  { get; private set; }
    public DateTime UpdatedAt  { get; private set; }

    private LandingSection() { }

    public static LandingSection Create(string sectionKey, int sortOrder) =>
        new() { Id=Guid.NewGuid(), SectionKey=sectionKey, SortOrder=sortOrder,
                IsVisible=true, UpdatedAt=DateTime.UtcNow };

    public void SetVisibility(bool visible) { IsVisible = visible; UpdatedAt = DateTime.UtcNow; }
    public void SetOrder(int order)         { SortOrder = order;   UpdatedAt = DateTime.UtcNow; }
    public void Touch()                     { UpdatedAt = DateTime.UtcNow; }
}