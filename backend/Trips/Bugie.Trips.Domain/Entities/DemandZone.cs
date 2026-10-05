namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Celda (~500 m) del mapa de demanda del conductor: cuantas solicitudes
/// pendientes/negociando hay alrededor de (Lat, Lng). Solo lectura.
/// </summary>
public class DemandZone
{
    public double Lat { get; set; }
    public double Lng { get; set; }
    public int Count { get; set; }
    public int Deliveries { get; set; }
    public int Trips { get; set; }
}
