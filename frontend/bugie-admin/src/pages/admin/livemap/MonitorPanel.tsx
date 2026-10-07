import { ReactNode } from 'react';
import { Tabs } from '../../../components/ui';

export type PanelTab = 'drivers' | 'trips' | 'alerts';

interface Props {
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  counts: { drivers: number; trips: number; alerts: number };
  drivers: ReactNode;
  trips: ReactNode;
  alerts: ReactNode;
}

/**
 * Panel del monitoreo con pestañas Conductores · Viajes · Alertas.
 * En escritorio va al costado del mapa; en pantallas chicas, dentro de un Drawer.
 * La búsqueda está arriba del mapa (buscador único) y los filtros en los chips.
 */
export default function MonitorPanel({ tab, onTabChange, counts, drivers, trips, alerts }: Props) {
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
        {tab === 'drivers' && drivers}
        {tab === 'trips' && trips}
        {tab === 'alerts' && alerts}
      </div>
    </div>
  );
}
