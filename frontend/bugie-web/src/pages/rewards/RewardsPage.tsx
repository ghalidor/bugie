import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import RewardsSummary from './RewardsSummary';
import RewardsCatalog from './RewardsCatalog';
import RewardsCoupons from './RewardsCoupons';
import RewardsExtras from './RewardsExtras';
import type { RedeemResult } from '../../state/rewards';

type Tab = 'resumen' | 'canjear' | 'cupones' | 'extras';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'resumen', label: 'Mis puntos',   icon: 'fa-solid fa-star' },
  { key: 'canjear', label: 'Canjear',      icon: 'fa-solid fa-gift' },
  { key: 'cupones', label: 'Mis cupones',  icon: 'fa-solid fa-ticket' },
  { key: 'extras',  label: 'Promos y sorteos', icon: 'fa-solid fa-bolt' },
];

/// Pagina de puntos. La usan pasajero y conductor: el backend sabe quien es
/// por el token y devuelve su saldo, sus niveles y su catalogo.
export default function RewardsPage() {
  const [tab, setTab] = useState<Tab>('resumen');

  // Cambia despues de un canje para que las pestanas recarguen datos frescos.
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastCoupon, setLastCoupon] = useState<string | null>(null);

  function handleRedeemed(result: RedeemResult) {
    setLastCoupon(result.redemption.code);
    setRefreshKey(k => k + 1);
    setTab('cupones');
  }

  return (
    <>
      <PageHeader
        title="Mis puntos"
        subtitle="Gana puntos en cada viaje y cámbialos por recompensas."
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
            className={`btn rounded-pill ${tab === t.key ? 'btn-bugie' : 'btn-bugie-outline'}`}
          >
            <i className={`${t.icon} me-2`} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <RewardsSummary key={`s${refreshKey}`} onGoToCatalog={() => setTab('canjear')} />}
      {tab === 'canjear' && <RewardsCatalog key={`c${refreshKey}`} onRedeemed={handleRedeemed} />}
      {tab === 'extras' && <RewardsExtras key={`e${refreshKey}`} />}
      {tab === 'cupones' && (
        <RewardsCoupons
          key={`u${refreshKey}`}
          highlightCode={lastCoupon}
          onDismissHighlight={() => setLastCoupon(null)}
        />
      )}
    </>
  );
}
