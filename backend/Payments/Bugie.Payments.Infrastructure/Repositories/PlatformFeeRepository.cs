using System.Data;
using Dapper;
using Microsoft.Extensions.Logging;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

/// <summary>
/// Lee la comision de landing.systemsettings, la misma tabla que el admin
/// edita en Contenido -> Configuracion.
///
/// EL VALOR ESTA EN PORCENTAJE: 10 significa 10%. Antes estaba guardado como
/// fraccion (0.10) mientras la pantalla decia "(%)", asi que un administrador
/// que escribiera 12 habria cobrado 12 veces la tarifa. La migracion 022 lo
/// paso a porcentaje.
///
/// Se guarda en memoria unos minutos: sin eso, cada viaje completado haria una
/// consulta extra para leer un numero que cambia una vez al ano.
/// </summary>
public class PlatformFeeRepository : IPlatformFeeRepository
{
    private static readonly TimeSpan Vigencia = TimeSpan.FromMinutes(5);

    /// <summary>Compartido entre peticiones: el repositorio se crea por peticion.</summary>
    private static decimal? _cache;
    private static DateTime _leidoEn = DateTime.MinValue;
    private static readonly object _candado = new();

    private readonly IDbConnection _db;
    private readonly ILogger<PlatformFeeRepository> _log;

    public PlatformFeeRepository(IDbConnection db, ILogger<PlatformFeeRepository> log)
    {
        _db  = db;
        _log = log;
    }

    public async Task<decimal> GetFeePercentAsync(CancellationToken ct = default)
    {
        lock (_candado)
        {
            if (_cache.HasValue && DateTime.UtcNow - _leidoEn < Vigencia)
                return _cache.Value;
        }

        string? valor;
        try
        {
            valor = await _db.QuerySingleOrDefaultAsync<string>(@"
                SELECT Value FROM landing.SystemSettings
                WHERE SettingKey = 'platform_fee_rate'");
        }
        catch (Exception ex)
        {
            // Si hay un valor leido antes, se sigue usando: es mejor cobrar con
            // el ultimo valor conocido que no registrar el pago.
            lock (_candado)
            {
                if (_cache.HasValue)
                {
                    _log.LogError(ex,
                        "No se pudo leer la comision. Se usa el ultimo valor conocido: {Pct}%.",
                        _cache.Value);
                    return _cache.Value;
                }
            }
            throw new InvalidOperationException(
                "No se pudo leer la comision de la plataforma y no hay un valor " +
                "previo en memoria. El pago no se registra para no inventar un monto.", ex);
        }

        if (string.IsNullOrWhiteSpace(valor))
            throw new InvalidOperationException(
                "Falta la clave platform_fee_rate en landing.SystemSettings. " +
                "Ejecuta la migracion 022_comision_configurable.sql.");

        if (!decimal.TryParse(valor, System.Globalization.NumberStyles.Any,
                              System.Globalization.CultureInfo.InvariantCulture, out var pct))
            throw new InvalidOperationException(
                $"La comision configurada no es un numero: '{valor}'. " +
                "Corrigela en el admin, en Contenido -> Configuracion.");

        if (pct is < 0m or > 100m)
            throw new InvalidOperationException(
                $"La comision configurada esta fuera de rango: {pct}. Debe estar entre 0 y 100.");

        lock (_candado)
        {
            _cache   = pct;
            _leidoEn = DateTime.UtcNow;
        }

        return pct;
    }
}
