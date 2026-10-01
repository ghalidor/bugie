using MediatR;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Queries;

public class GetNewsHandler : IRequestHandler<GetNewsQuery, List<NewsArticle>>
{
    private readonly INewsRepository _news;
    public GetNewsHandler(INewsRepository news) => _news = news;

    public Task<List<NewsArticle>> Handle(GetNewsQuery q, CancellationToken ct) =>
        _news.GetPublishedAsync(q.Lang, ct);
}
