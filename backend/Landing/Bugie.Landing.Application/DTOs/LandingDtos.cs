namespace Bugie.Landing.Application.DTOs;

public record SectionContentDto(
    Guid   Id,
    Guid   SectionId,
    string Lang,
    string ContentJson,
    DateTime UpdatedAt);

/// <summary>
/// Respuesta completa de la landing para un idioma específico.
/// El frontend recibe esto y renderiza las secciones.
/// </summary>
public record LandingPageDto(
    string              Lang,
    List<SectionWithContentDto> Sections);

public record SectionWithContentDto(
    Guid   SectionId,
    string SectionKey,
    int    SortOrder,
    string ContentJson);