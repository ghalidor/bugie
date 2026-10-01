using MediatR;
using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Application.Queries;

public record GetSettingsQuery : IRequest<List<SystemSetting>>;
