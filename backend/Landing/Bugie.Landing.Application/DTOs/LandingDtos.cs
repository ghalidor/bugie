namespace Bugie.Landing.Application.DTOs;

public record LandingSectionDto(
    Guid   Id,
    string SectionKey,
    int    SortOrder,
    bool   IsVisible,
    DateTime UpdatedAt);

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

// Petición para actualizar el contenido de una sección
public record UpdateSectionContentRequest(
    string SectionKey,
    string Lang,          // es | en | pt
    string ContentJson);  // JSON con los campos editables