using MediatR;
using Bugie.Landing.Application.DTOs;

namespace Bugie.Landing.Application.Queries;

/// <summary>
/// Obtiene toda la landing para un idioma — la llama el frontend público.
/// </summary>
public record GetLandingPageQuery(string Lang = "es") : IRequest<LandingPageDto>;