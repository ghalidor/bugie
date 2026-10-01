namespace Bugie.Rewards.Domain.Entities;

/// <summary>Configuracion clave/valor del motor de puntos.</summary>
public class RewardSetting
{
    public Guid      Id          { get; set; }
    public string    SettingKey  { get; set; } = string.Empty;
    public string    Value       { get; set; } = string.Empty;
    public string?   Description { get; set; }
    public DateTime  UpdatedAt   { get; set; }
    public Guid?     UpdatedBy   { get; set; }
}
