import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch } from '../../../state/api';
import { rewardsAdminApi, CouponUsage, CouponUsageReport, fmtDate } from '../../../state/rewards';
import { Column, DataTable, SectionCard, Skeleton, StatCard, StatGrid, StatusBadge, Tone } from '../../../components/ui';
import { errMsg, LoadError, soles } from './common';

/* ──────────────────────────────────────────────────────────────────────────
   Cupones aplicados a viajes.

   Mientras el interruptor esté apagado esto no crece, y la tarjeta lo dice:
   una tabla vacía sin explicación parece que algo se rompió.

   Lo que el descuento te cuesta: el monto que el pasajero dejó de pagar y la
   comisión que dejaste de cobrar sobre ese monto (la comisión se calcula
   sobre lo que SE PAGÓ).
   ────────────────────────────────────────────────────────────────────────── */

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  completed:   { label: 'Completado', tone: 'ok' },
  cancelled:   { label: 'Cancelado',  tone: 'neutral' },
  in_progress: { label: 'En curso',   tone: 'info' },
};

export default function CouponUsageCard() {
  const [data,    setData]    = useState<CouponUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // % de comisión configurado (landing.systemsettings.platform_fee_rate)
  const [feeRate, setFeeRate] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    apiFetch<{ settingKey: string; value: string }[]>(`${API.landing}/landing/settings`)
      .then(list => {
        const v = Number(list.find(s => s.settingKey === 'platform_fee_rate')?.value);
        if (Number.isFinite(v)) setFeeRate(v);
      })
      .catch(() => { /* sin el % no se muestra la estimación */ });

    rewardsAdminApi.couponUsage()
      .then(setData)
      .catch(e => { setData(null); setError(errMsg(e, 'No se pudo cargar el uso de cupones.')); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const columns: Column<CouponUsage>[] = [
    { key: 'coupon', header: 'Cupón', priority: 1, render: r => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-mono">{r.couponCode}</div>
        {r.itemName && <div className="rw-cell-sub">{r.itemName}</div>}
      </div>
    ) },
    { key: 'passenger', header: 'Pasajero', priority: 2, render: r => r.passengerName ?? '—' },
    { key: 'driver', header: 'Conductor', priority: 3, render: r => r.driverName ?? '—' },
    { key: 'fare', header: 'Tarifa', align: 'right', priority: 3, render: r => <span className="bugie-muted">{soles(r.fareBeforeDiscount)}</span> },
    { key: 'discount', header: 'Descuento', align: 'right', priority: 1, render: r => <span className="rw-minus">−{soles(r.discountAmount)}</span> },
    { key: 'paid', header: 'Pagó', align: 'right', priority: 2, render: r => <strong>{soles(r.amountPaid)}</strong> },
    { key: 'status', header: 'Estado', priority: 1, render: r => {
      const e = ESTADO[r.status] ?? ESTADO.in_progress;
      return <StatusBadge tone={e.tone} size="sm">{e.label}</StatusBadge>;
    } },
    { key: 'date', header: 'Fecha', priority: 2, render: r => fmtDate(r.completedAt ?? r.createdAt) },
  ];

  return (
    <SectionCard
      title="Cupones aplicados a viajes"
      icon="fa-tag"
      description="Lo que dejan de pagar los pasajeros cuando usan un cupón."
      actions={data && !data.featureEnabled ? <StatusBadge tone="warn" icon="fa-power-off">Función apagada</StatusBadge> : undefined}
      flush
    >
      <div className="p-3 rw-stack">
        {loading ? <Skeleton count={3} height={16} /> : error || !data ? (
          <LoadError text={error ?? 'No se pudo cargar.'} onRetry={load} />
        ) : (
          <>
            {!data.featureEnabled && (
              <div className="alert alert-warning small py-2 mb-0">
                La función está apagada: los cupones no descuentan del precio. Se enciende en{' '}
                <Link to="/admin/puntos/ajustes">Ajustes → General → Canje y cupones</Link>.
                {data.trips > 0 && ' Lo que ves abajo es de cuando estuvo encendida.'}
              </div>
            )}
            {data.trips > 0 && (
              <StatGrid min={160}>
                <StatCard label="Viajes con cupón" value={data.trips} icon="fa-car-side" tone="primary" hint={`${data.tripsCompleted} completados, ${data.tripsCancelled} cancelados`} />
                <StatCard label="Descontado en total" value={soles(data.totalDiscount)} icon="fa-tags" tone="warn" hint="Lo que dejaron de pagar" />
                <StatCard label="Promedio por viaje" value={soles(data.averageDiscount)} icon="fa-divide" tone="info" />
                <StatCard
                  label="Comisión no cobrada"
                  value={feeRate == null ? '—' : soles(data.totalDiscount * feeRate / 100)}
                  icon="fa-percent"
                  tone="bad"
                  hint={feeRate == null ? 'No se pudo leer el % de comisión' : `Aprox., al ${feeRate}% de lo descontado`}
                />
              </StatGrid>
            )}
          </>
        )}
      </div>
      {!loading && data && (
        <DataTable
          columns={columns}
          rows={data.recent ?? []}
          rowKey={r => r.tripId}
          maxHeight="none"
          empty={{ title: 'Todavía ningún viaje usó un cupón', text: 'Un viaje cancelado con cupón no lo consume: vuelve a quedar disponible para su dueño.' }}
        />
      )}
    </SectionCard>
  );
}
