using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Promociones vigentes que le sirven al usuario. A diferencia de la consulta
/// del admin, no trae configuración interna ni estadísticas de costo: solo lo
/// que tiene sentido mostrarle a quien va a viajar.
/// </summary>
public record GetActivePromotionsQuery(string UserType) : IRequest<List<ActivePromotionDto>>;
