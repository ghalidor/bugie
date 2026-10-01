import { useState } from 'react';
import PageHeader from '../../../components/PageHeader';
import SettingsTab from './SettingsTab';
import LevelsTab from './LevelsTab';
import CatalogTab from './CatalogTab';
import RedemptionsTab from './RedemptionsTab';
import PromotionsTab from './PromotionsTab';
import RafflesTab from './RafflesTab';
import ReferralsTab from './ReferralsTab';

type Tab = 'config' | 'niveles' | 'catalogo' | 'canjes' | 'promos' | 'sorteos' | 'referidos';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'config',   label: 'Configuración', icon: 'fa-solid fa-sliders' },
  { key: 'niveles',  label: 'Niveles',       icon: 'fa-solid fa-medal' },
  { key: 'catalogo', label: 'Catálogo',      icon: 'fa-solid fa-gift' },
  { key: 'canjes',   label: 'Canjes',        icon: 'fa-solid fa-ticket' },
  { key: 'promos',   label: 'Promociones',   icon: 'fa-solid fa-bullhorn' },
  { key: 'sorteos',  label: 'Sorteos',       icon: 'fa-solid fa-dice' },
  { key: 'referidos', label: 'Referidos',    icon: 'fa-solid fa-user-plus' },
];

/// Administracion del programa de puntos. Todo lo que se cambia aca toma
/// efecto en el acto, sin recompilar ni reiniciar el servicio.
export default function RewardsAdmin() {
  const [tab, setTab] = useState<Tab>('config');

  return (
    <>
      <PageHeader
        title="Puntos y recompensas"
        subtitle="Tasas de conversión, niveles, catálogo de canje y entrega de premios."
        icon="fa-solid fa-star"
      />

      <div className="d-flex flex-wrap gap-2 mb-3" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="btn btn-sm"
            style={{
              borderRadius: 999,
              padding: '0.4rem 0.95rem',
              fontWeight: 600,
              border: `1px solid ${tab === t.key ? 'var(--bugie-primary)' : 'var(--bugie-border)'}`,
              background: tab === t.key ? 'var(--bugie-primary)' : 'transparent',
              color: tab === t.key ? '#fff' : 'var(--bugie-text)',
            }}
          >
            <i className={`${t.icon} me-2`} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config'   && <SettingsTab />}
      {tab === 'niveles'  && <LevelsTab />}
      {tab === 'catalogo' && <CatalogTab />}
      {tab === 'canjes'   && <RedemptionsTab />}
      {tab === 'promos'   && <PromotionsTab />}
      {tab === 'sorteos'  && <RafflesTab />}
      {tab === 'referidos' && <ReferralsTab />}
    </>
  );
}
