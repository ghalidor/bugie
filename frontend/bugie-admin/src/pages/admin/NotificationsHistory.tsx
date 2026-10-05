import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InboxList } from '../../components/NotificationBell';
import {
  FilterBar, Page, Pagination, SectionCard, Select, useConfirm, useToast,
} from '../../components/ui';
import {
  HISTORY_TYPES, InboxItem, InboxPage, adminInbox, useInboxSettings, useInboxUnread, useInboxVersion,
} from '../../state/adminInbox';
import { usePermissions, PERMS } from '../../state/permissions';
import './ops.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Sistema > Avisos > Historial: todos los avisos en vivo guardados para este
   admin (solo los de las secciones que puede ver). Filtros por leídos, tipo
   y fechas; marcar leído uno o todos.
   ────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function NotificationsHistory() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { has } = usePermissions();
  const settings = useInboxSettings();
  const unread = useInboxUnread();
  const version = useInboxVersion();

  const [chip, setChip] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [data, setData] = useState<InboxPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await adminInbox.list({ page, pageSize, type, from, to, unreadOnly: chip === 'unread' });
      setData(r);
      adminInbox.setUnread(r.unread ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, type, from, to, chip]);

  useEffect(() => { load(); }, [load]);
  // Llegó un aviso en vivo o se marcaron todos desde la campana: recarga sin parpadeo.
  useEffect(() => { if (version > 0) load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [version]);

  const patchItem = (id: string, read: boolean) =>
    setData(d => d && { ...d, items: d.items.map(x => (x.id === id ? { ...x, read, readAt: read ? (x.readAt ?? new Date().toISOString()) : null } : x)) });

  async function markRead(it: InboxItem) {
    if (it.read) return;
    patchItem(it.id, true);
    try {
      await adminInbox.markRead(it.id, true);
      if (chip === 'unread') load(true);
    } catch {
      patchItem(it.id, false);
      toast.error('No se pudo marcar el aviso como leído.');
    }
  }

  function openItem(it: InboxItem) {
    if (!it.read) markRead(it);
    if (it.link?.startsWith('/')) navigate(it.link);
  }

  async function markAll() {
    const ok = await confirm({
      title: '¿Marcar todos como leídos?',
      message: 'Todos tus avisos quedarán como leídos (no solo los de esta página). No se borra ninguno.',
      tone: 'primary',
      confirmText: 'Marcar todos',
    });
    if (!ok) return;
    setBusyAll(true);
    try {
      const n = await adminInbox.markAll();
      toast.success(n === 1 ? 'Se marcó 1 aviso como leído.' : `Se marcaron ${n.toLocaleString('es-PE')} avisos como leídos.`);
      load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron marcar los avisos.');
    } finally {
      setBusyAll(false);
    }
  }

  const activeCount = (type ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);
  const clear = () => { setType(''); setFrom(''); setTo(''); setPage(1); };
  const filtered = activeCount > 0 || chip === 'unread';

  const typeOptions = [
    { value: '', label: 'Todos los tipos' },
    ...HISTORY_TYPES.map(t => ({ value: t.type, label: t.label, icon: t.icon })),
  ];

  return (
    <Page
      title="Historial de avisos" icon="fa-clock-rotate-left" helpKey="notifications-history"
      subtitle="Todos los avisos en vivo que te llegaron, de las secciones que puedes ver."
      back={{ to: has(PERMS.ViewNotificationsConfig) ? '/admin/avisos' : '/admin/dashboard', label: has(PERMS.ViewNotificationsConfig) ? 'Avisos' : 'Inicio' }}
      actions={[
        { label: 'Marcar todos como leídos', icon: 'fa-check-double', variant: 'primary', onClick: markAll, loading: busyAll, disabled: unread === 0 },
      ]}
    >
      <SectionCard flush tourId="nhist-list">
        <div className="p-3" data-tour="nhist-filters">
          <FilterBar
            chips={[
              { value: 'all', label: 'Todos', count: data && chip === 'all' && !activeCount ? data.total : undefined },
              { value: 'unread', label: 'No leídos', count: unread },
            ]}
            chip={chip}
            onChipChange={v => { setChip(v as 'all' | 'unread'); setPage(1); }}
            activeCount={activeCount}
            onClear={activeCount ? clear : undefined}
          >
            <Select value={type} onChange={v => { setType(String(v)); setPage(1); }} options={typeOptions}
                    size="sm" width="auto" aria-label="Tipo de aviso" />
            <label className="ops-filter"><span>Desde</span>
              <input type="date" className="form-control form-control-sm" value={from} max={to || undefined}
                     onChange={e => { setFrom(e.target.value); setPage(1); }} />
            </label>
            <label className="ops-filter"><span>Hasta</span>
              <input type="date" className="form-control form-control-sm" value={to} min={from || undefined}
                     onChange={e => { setTo(e.target.value); setPage(1); }} />
            </label>
          </FilterBar>
        </div>

        <div className="bx-nhist-list">
          <InboxList
            className="is-page"
            items={data?.items ?? null}
            loading={loading && !data}
            error={error}
            settings={settings}
            detailed
            onOpen={openItem}
            onMarkRead={markRead}
            onRetry={() => load()}
            emptyTitle={filtered ? 'No hay avisos con estos filtros' : 'Todavía no tienes avisos'}
            emptyText={filtered
              ? (chip === 'unread' && !activeCount ? 'Estás al día: no tienes avisos sin leer.' : 'Prueba con otro tipo o rango de fechas.')
              : 'Aquí verás los mensajes, reclamaciones, registros y desvíos que lleguen en vivo.'}
          />
        </div>

        {data && data.total > 0 && !error && (
          <div className="px-3">
            <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage}
                        onPageSizeChange={n => { setPageSize(n); setPage(1); }} pageSizeOptions={PAGE_SIZE_OPTIONS} />
          </div>
        )}
      </SectionCard>
    </Page>
  );
}
