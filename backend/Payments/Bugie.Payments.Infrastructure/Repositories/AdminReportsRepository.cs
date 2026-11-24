using System.Data;
using Dapper;
using Bugie.Payments.Domain.Common;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

/// <summary>Reportes administrativos de pagos. Todo se agrega en SQL.</summary>
public class AdminReportsRepository : IAdminReportsRepository
{
    private readonly IDbConnection _db;
    public AdminReportsRepository(IDbConnection db) => _db = db;

    public async Task<PaymentsSummaryData> GetPaymentsSummaryAsync(ReportPeriod period, CancellationToken ct = default)
    {
        // Rango UTC [@From, @To). El dia de Peru es (columna AT TIME ZONE 'America/Lima').
        // PlatformFeeRate se guarda en porcentaje (10.00 = 10 %).
        const string sql = @"
            -- 1) Totales de pagos completados
            SELECT COUNT(*)::int                                AS Payments,
                   ROUND(COALESCE(SUM(p.Amount), 0), 2)         AS Amount,
                   ROUND(COALESCE(SUM(p.PlatformFee), 0), 2)    AS PlatformFee,
                   ROUND(COALESCE(SUM(p.DriverAmount), 0), 2)   AS DriverAmount,
                   ROUND(AVG(p.PlatformFeeRate), 1)             AS AvgFeeRatePct
            FROM payments.Payments p
            WHERE p.Status = 'completed'
              AND COALESCE(p.PaidAt, p.CreatedAt) >= @From
              AND COALESCE(p.PaidAt, p.CreatedAt) <  @To;

            -- 2) Por metodo de pago
            SELECT p.Method                                     AS Method,
                   COUNT(*)::int                                AS Count,
                   ROUND(COALESCE(SUM(p.Amount), 0), 2)         AS Amount,
                   ROUND(COALESCE(SUM(p.PlatformFee), 0), 2)    AS PlatformFee
            FROM payments.Payments p
            WHERE p.Status = 'completed'
              AND COALESCE(p.PaidAt, p.CreatedAt) >= @From
              AND COALESCE(p.PaidAt, p.CreatedAt) <  @To
            GROUP BY p.Method
            ORDER BY p.Method;

            -- 3) Serie diaria con todos los dias del rango (0 si no hubo pagos)
            WITH dias AS (
                -- dias de calendario de Peru (timestamp sin zona: no depende de la sesion)
                SELECT g::date AS Dia FROM generate_series(@FromDay::timestamp, @ToDay::timestamp, interval '1 day') g
            ),
            pagos AS (
                SELECT (COALESCE(p.PaidAt, p.CreatedAt) AT TIME ZONE 'America/Lima')::date AS Dia,
                       SUM(p.Amount) AS Monto, SUM(p.PlatformFee) AS Comision
                FROM payments.Payments p
                WHERE p.Status = 'completed'
                  AND COALESCE(p.PaidAt, p.CreatedAt) >= @From
                  AND COALESCE(p.PaidAt, p.CreatedAt) <  @To
                GROUP BY 1
            )
            SELECT to_char(d.Dia, 'YYYY-MM-DD')        AS Date,
                   ROUND(COALESCE(x.Monto, 0), 2)      AS Amount,
                   ROUND(COALESCE(x.Comision, 0), 2)   AS PlatformFee
            FROM dias d
            LEFT JOIN pagos x ON x.Dia = d.Dia
            ORDER BY d.Dia;

            -- 4) Comisiones de la billetera del conductor
            SELECT
                (SELECT ROUND(COALESCE(SUM(t.Amount), 0), 2) FROM payments.WalletTransactions t
                 WHERE t.Type = 'comision'
                   AND t.CreatedAt >= @From AND t.CreatedAt < @To)                         AS Charged,
                (SELECT ROUND(COALESCE(SUM(t.Amount), 0), 2) FROM payments.WalletTransactions t
                 WHERE t.Type = 'pago_comision'
                   AND COALESCE(t.PaidAt, t.CreatedAt) >= @From
                   AND COALESCE(t.PaidAt, t.CreatedAt) <  @To)                             AS Paid,
                (SELECT ROUND(COALESCE(SUM(-w.Balance) FILTER (WHERE w.Balance < 0), 0), 2)
                 FROM payments.DriverWallet w)                                             AS PendingNow;
        ";

        var args = new
        {
            From    = period.FromUtc,
            To      = period.ToUtc,
            FromDay = period.FromText,
            ToDay   = period.ToText,
        };

        using var grid = await _db.QueryMultipleAsync(new CommandDefinition(sql, args, cancellationToken: ct));
        return new PaymentsSummaryData
        {
            Totals      = await grid.ReadSingleAsync<PaymentsTotalsRow>(),
            ByMethod    = (await grid.ReadAsync<PaymentsByMethodRow>()).ToList(),
            Daily       = (await grid.ReadAsync<PaymentsDailyRow>()).ToList(),
            Commissions = await grid.ReadSingleAsync<CommissionsSummaryRow>(),
        };
    }
}
