namespace Bugie.Landing.Domain.Entities;

public class NewsArticle
{
    public Guid Id { get; set; }
    public string Slug { get; set; } = string.Empty;
    public string Tag { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string Lang { get; set; } = string.Empty;
    public bool IsPublished { get; set; }
    public DateTime PublishedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
