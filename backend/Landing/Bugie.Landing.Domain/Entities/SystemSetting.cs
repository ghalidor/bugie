namespace Bugie.Landing.Domain.Entities;

public class SystemSetting
{
    public Guid     Id          { get; private set; }
    public string   SettingKey  { get; private set; }
    public string   Value       { get; private set; }
    public string?  Description { get; private set; }
    public DateTime UpdatedAt   { get; private set; }
    public Guid?    UpdatedBy   { get; private set; }

    private SystemSetting() { }

    public void Update(string value, Guid updatedBy)
    {
        Value     = value;
        UpdatedAt = DateTime.UtcNow;
        UpdatedBy = updatedBy;
    }
}
