import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, Tabs } from '../../components/ui';
import RewardsSummary from './RewardsSummary';
import RewardsCatalog from './RewardsCatalog';
import RewardsCoupons from './RewardsCoupons';
import RewardsExtras from './RewardsExtras';
import RewardsReferral from './RewardsReferral';
import type { RedeemResult } from '../../state/rewards';

type Tab = 'resumen' | 'canjear' | 'cupones' | 'extras' | 'invita';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'resumen', label: 'Mis puntos',   icon: 'fa-star' },
  { key: 'canjear', label: 'Canjear',      icon: 'fa-gift' },
  { key: 'cupones', label: 'Mis cupones',  icon: 'fa-ticket' },
  { key: 'extras',  label: 'Promos y sorteos', icon: 'fa-bolt' },
  { key: 'invita',  label: 'Invita y gana',    icon: 'fa-user-plus' },
];

/// Pagina de puntos. La usan pasajero y conductor: el backend sabe quien es
/// por el token y devuelve su saldo, sus niveles y su catalogo.
/// ?tab= que llega desde una notificacion (push o bandeja).
const TAB_FROM_URL: Record<string, Tab> = {
  summary: 'resumen',
  promos:  'extras',
};

export default function RewardsPage() {
  const [params] = useSearchParams();
  const urlTab = TAB_FROM_URL[params.get('tab') ?? ''];
  const [tab, setTab] = useState<Tab>(urlTab ?? 'resumen');

  // Si ya estabas en la pagina y llega otra notificacion, cambia de pestana.
  useEffect(() => {
    if (urlTab) setTab(urlTab);
  }, [urlTab]);

  // Cambia despues de un canje para que las pestanas recarguen datos frescos.
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastCoupon, setLastCoupon] = useState<string | null>(null);
  // Cambia al reclamar un beneficio de nivel: solo recarga "Mis cupones".
  const [couponsKey, setCouponsKey] = useState(0);

  function handleRedeemed(result: RedeemResult) {
    setLastCoupon(result.redemption.code);
    setRefreshKey(k => k + 1);
    setTab('cupones');
  }

  return (
    <Page
      title="Mis puntos"
      subtitle="Gana puntos en cada viaje y cámbialos por recompensas."
      icon="fa-star"
    >
      <Tabs
        ariaLabel="Secciones de puntos"
        value={tab}
        onChange={v => setTab(v as Tab)}
        items={TABS.map(t => ({ value: t.key, label: t.label, icon: t.icon }))}
      />

      <div key={tab} className="bx-tab-panel" role="tabpanel">
      {tab === 'resumen' && (
        <RewardsSummary
          key={`s${refreshKey}`}
          onGoToCatalog={() => setTab('canjear')}
          onCouponClaimed={() => setCouponsKey(k => k + 1)}
        />
      )}
      {tab === 'canjear' && <RewardsCatalog key={`c${refreshKey}`} onRedeemed={handleRedeemed} />}
      {tab === 'extras' && <RewardsExtras key={`e${refreshKey}`} />}
      {tab === 'invita' && <RewardsReferral key={`r${refreshKey}`} />}
      {tab === 'cupones' && (
        <RewardsCoupons
          key={`u${refreshKey}-${couponsKey}`}
          highlightCode={lastCoupon}
          onGoToRaffles={() => setTab('extras')}
          onDismissHighlight={() => setLastCoupon(null)}
        />
      )}
      </div>
    </Page>
  );
}
