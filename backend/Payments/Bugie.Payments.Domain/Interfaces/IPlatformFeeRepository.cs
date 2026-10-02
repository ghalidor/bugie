namespace Bugie.Payments.Domain.Interfaces;

/// <summary>
/// Lee la comision de la plataforma, que el admin edita en
/// Contenido -> Configuracion.
///
/// NO hay valor de respaldo en appsettings: la comision es un dato de negocio
/// y vive en un solo sitio. Tener el mismo numero en dos lugares es garantia
/// de que algun dia no coincidan y nadie sepa cual manda.
/// </summary>
public interface IPlatformFeeRepository
{
    /// <summary>
    /// El porcentaje configurado (10 = 10%). Lanza si no se puede obtener:
    /// es preferible que falle el registro del pago a cobrar una comision
    /// inventada.
    /// </summary>
    Task<decimal> GetFeePercentAsync(CancellationToken ct = default);
}
