import { useCallback, useEffect, useRef, useState } from 'react';
import {
  rewardsAdminApi, Raffle, RaffleTicketRow, RaffleTicketsPage, TICKET_SOURCE_LABEL,
  fmtDate, fmtPoints, raffleTypeLabel, ticketSourceLabel,
} from '../../../state/rewards';
import { Column, DataTable, Drawer, FilterBar, Pagination, StatusBadge, useDebouncedValue } from '../../../components/ui';
import { DriverLink, PassengerLink } from '../../../components/EntityLinks';
import { errMsg, LoadError } from './common';

/*
 * Participantes de un sorteo: resumen (personas, tickets y tickets por
 * origen), buscador por nombre o número de ticket y la lista paginada.
 * GET {rewards}/rewards/admin/raffles/{raffleId}/tickets
 */

const PAGE_SIZE = 50;

const roleLabel = (role?: string | null) =>
  role === 'driver' ? 'Conductor' : role === 'passenger' ? 'Pasajero' : role || '—';

/** Nombre del usuario con enlace a su ficha (si el admin tiene permiso). */
function UserCell({ t }: { t: RaffleTicketRow }) {
  const name = t.userName || `Usuario ${t.userId.slice(0, 8)}`;
  if (t.userRole === 'driver') return <DriverLink userId={t.userId}>{name}</DriverLink>;
  if (t.userRole === 'passenger') return <PassengerLink userId={t.userId}>{name}</PassengerLink>;
  return <span>{name}</span>;
}

export default function RaffleParticipants({ raffle, onClose }: { raffle: Raffle | null; onClose: () => void }) {
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [data,    setData]    = useState<RaffleTicketsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const q = useDebouncedValue(search, 350);
  const raffleId = raffle?.id ?? null;

  // Sorteo nuevo: se empieza de cero.
  useEffect(() => { setPage(1); setSearch(''); setData(null); setError(null); }, [raffleId]);
  // Búsqueda nueva: vuelve a la primera página.
  useEffect(() => { setPage(1); }, [q]);

  // Solo vale la respuesta del último pedido (al paginar o buscar rápido).
  const reqId = useRef(0);
  const load = useCallback(() => {
    if (!raffleId) return;
    const id = ++reqId.current;
    setLoading(true); setError(null);
    rewardsAdminApi.raffleTickets(raffleId, page, PAGE_SIZE, q)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(e => { if (id === reqId.current) setError(errMsg(e, 'No se pudieron cargar los participantes.')); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [raffleId, page, q]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<RaffleTicketRow>[] = [
    { key: 'ticket', header: 'Ticket', priority: 1, render: t => (
      <span className="rw-badges">
        <span className="rw-mono">{t.ticketNumber}</span>
        {t.isWinner && <StatusBadge tone="ok" icon="fa-trophy" size="sm">Ganador</StatusBadge>}
      </span>
    ) },
    { key: 'user', header: 'Participante', priority: 1, render: t => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main text-truncate"><UserCell t={t} /></div>
        <div className="rw-cell-sub">{roleLabel(t.userRole)}</div>
      </div>
    ) },
    { key: 'source', header: 'Origen', priority: 2, render: t => ticketSourceLabel(t.source) },
    { key: 'date', header: 'Fecha', priority: 3, render: t => fmtDate(t.createdAt, true) },
  ];

  // Orígenes con tickets: primero los conocidos (en su orden) y luego cualquier otro.
  const bySource = data?.bySource ?? {};
  const sources = [
    ...Object.keys(TICKET_SOURCE_LABEL).filter(k => (bySource[k] ?? 0) > 0),
    ...Object.keys(bySource).filter(k => !(k in TICKET_SOURCE_LABEL) && (bySource[k] ?? 0) > 0),
  ];

  return (
    <Drawer
      open={!!raffle}
      onClose={onClose}
      title={raffle ? `Participantes · ${raffle.name}` : undefined}
      description={raffle ? raffleTypeLabel(raffle.raffleType) : undefined}
      size="lg"
    >
      {raffle && (
        <div className="rw-stack">
          <dl className="rw-kv" aria-busy={loading && !data}>
            <div><dt>Participantes</dt><dd>{data ? fmtPoints(data.participants) : '—'}</dd></div>
            <div><dt>Tickets</dt><dd>{data ? fmtPoints(data.totalTickets) : '—'}</dd></div>
          </dl>
          {sources.length > 0 && (
            <div>
              <div className="small bugie-muted mb-1">Tickets por origen</div>
              <span className="rw-badges">
                {sources.map(k => (
                  <StatusBadge key={k} tone="neutral" size="sm">{ticketSourceLabel(k)}: {fmtPoints(bySource[k])}</StatusBadge>
                ))}
              </span>
            </div>
          )}

          <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por nombre o número de ticket…" />

          {error ? <LoadError text={error} onRetry={load} /> : (
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={t => t.ticketNumber}
              loading={loading}
              maxHeight="none"
              caption="Tickets del sorteo"
              empty={q.trim()
                ? { title: 'Sin resultados', text: 'Nadie coincide con esa búsqueda.' }
                : { title: 'Aún no hay tickets', text: 'Se reparten solos cada madrugada, o ahora con «Repartir tickets».' }}
            />
          )}

          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      )}
    </Drawer>
  );
}
