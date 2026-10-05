import { ReactNode, useId } from 'react';
import { Tabs } from '../../../components/ui';

export type PanelTab = 'drivers' | 'trips' | 'alerts';

interface Props {
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  counts: { drivers: number; trips: number; alerts: number };
  search: string;
  onSearchChange: (v: string) => void;
  drivers: ReactNode;
  trips: ReactNode;
  alerts: ReactNode;
}

/**
 * Panel del monitoreo con pestañas Conductores · Viajes · Alertas.
 * En escritorio va al costado del mapa; en pantallas chicas, dentro de un Drawer.
 */
export default function MonitorPanel({ tab, onTabChange, counts, search, onSearchChange, drivers, trips, alerts }: Props) {
  const searchId = useId();
  return (
    <div className="lm-panel">
      <div className="lm-panel-tabs" data-tour="monitor-tabs">
        <Tabs
          ariaLabel="Listas del monitoreo"
          value={tab}
          onChange={v => onTabChange(v as PanelTab)}
          items={[
            { value: 'drivers', label: 'Conductores', icon: 'fa-car',                  count: counts.drivers },
            { value: 'trips',   label: 'Viajes',      icon: 'fa-route',                count: counts.trips },
            { value: 'alerts',  label: 'Alertas',     icon: 'fa-triangle-exclamation', count: counts.alerts },
          ]}
        />
      </div>
      <div className="lm-panel-body" role="tabpanel" aria-label={tab === 'drivers' ? 'Conductores' : tab === 'trips' ? 'Viajes' : 'Alertas'}>
        {tab === 'drivers' && (
          <>
            <div className="lm-panel-search">
              <div className="bx-search">
                <label htmlFor={searchId} className="bx-sr">Buscar conductor</label>
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input id={searchId} type="search" className="form-control form-control-sm" placeholder="Buscar conductor…"
                       value={search} onChange={e => onSearchChange(e.target.value)} />
                {search && (
                  <button type="button" className="bx-search-clear" onClick={() => onSearchChange('')} aria-label="Borrar búsqueda">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            {drivers}
          </>
        )}
        {tab === 'trips' && trips}
        {tab === 'alerts' && alerts}
      </div>
    </div>
  );
}
