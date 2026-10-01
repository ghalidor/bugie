namespace Bugie.Landing.Domain.Entities;

/// <summary>
/// Contenido de una sección en un idioma específico.
/// Un LandingSection tiene N SectionContent (uno por idioma).
/// </summary>
public class SectionContent
{
    public Guid     Id          { get; private set; }
    public Guid     SectionId   { get; private set; }
    public string   Lang        { get; private set; }  // es | en | pt
    public string   ContentJson { get; private set; }  // JSON libre con los campos de la sección
    public DateTime UpdatedAt   { get; private set; }

    private SectionContent() { }

    public static SectionContent Create(Guid sectionId, string lang, string contentJson) =>
        new() { Id=Guid.NewGuid(), SectionId=sectionId, Lang=lang,
                ContentJson=contentJson, UpdatedAt=DateTime.UtcNow };

    public void Update(string contentJson) { ContentJson = contentJson; UpdatedAt = DateTime.UtcNow; }
}