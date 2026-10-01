using MediatR;
using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Application.Queries;

public record GetNewsQuery(string Lang = "es") : IRequest<List<NewsArticle>>;
