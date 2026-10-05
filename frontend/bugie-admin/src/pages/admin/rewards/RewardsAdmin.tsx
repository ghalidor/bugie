import { Page, Tabs, useTabParam } from '../../../components/ui';
import BalanceTab from './BalanceTab';
import ReferralsTab from './ReferralsTab';
import CouponUsageCard from './CouponUsageCard';
import RedemptionsTab from './RedemptionsTab';
import SupportTab from './SupportTab';
import CatalogTab from './CatalogTab';
import LevelsTab from './LevelsTab';
import PromotionsTab from './PromotionsTab';
import RafflesTab from './RafflesTab';
import SettingsTab from './SettingsTab';
import './rewards.css';

/// Fidelización (programa de puntos). Cada subruta de /admin/puntos es una
/// página propia; lo que se cambia aquí toma efecto en el acto, sin
/// recompilar ni reiniciar el servicio.

/** /admin/puntos/resumen — balance, referidos y uso de cupones. */
export function RewardsSummary() {
  const [tab] = useTabParam(['balance', 'referidos', 'cupones']);
  return (
    <Page
      title="Resumen de puntos"
      subtitle="Cuánto debes en puntos, de dónde salen y qué tan bien funcionan los referidos."
      icon="fa-chart-pie"
      helpKey="rewards-summary"
    >
      <div data-tour="rw-sum-tabs">
        <Tabs items={[
          { value: 'balance',   label: 'Balance',            icon: 'fa-scale-balanced' },
          { value: 'referidos', label: 'Referidos',          icon: 'fa-user-plus' },
          { value: 'cupones',   label: 'Cupones en viajes',  icon: 'fa-tag' },
        ]} />
      </div>
      {tab === 'balance'   && <BalanceTab />}
      {tab === 'referidos' && <ReferralsTab />}
      {tab === 'cupones'   && <CouponUsageCard />}
    </Page>
  );
}

/** /admin/puntos/canjes — entrega de canjes y soporte a usuarios. */
export function RewardsRedemptions() {
  const [tab] = useTabParam(['canjes', 'soporte']);
  return (
    <Page
      title="Canjes y soporte"
      subtitle="Entrega lo que canjearon y corrige los puntos de quien reclama."
      icon="fa-ticket"
      helpKey="rewards-redemptions"
    >
      <div data-tour="rw-red-tabs">
        <Tabs items={[
          { value: 'canjes',  label: 'Canjes',              icon: 'fa-ticket' },
          { value: 'soporte', label: 'Soporte de usuario',  icon: 'fa-magnifying-glass' },
        ]} />
      </div>
      {tab === 'canjes'  && <RedemptionsTab />}
      {tab === 'soporte' && <SupportTab />}
    </Page>
  );
}

/** /admin/puntos/catalogo — recompensas canjeables y niveles. */
export function RewardsCatalog() {
  const [tab] = useTabParam(['catalogo', 'niveles']);
  return (
    <Page
      title="Catálogo y niveles"
      subtitle="Qué se puede canjear y qué beneficios da cada nivel."
      icon="fa-gift"
      helpKey="rewards-catalog"
    >
      <div data-tour="rw-cat-tabs">
        <Tabs items={[
          { value: 'catalogo', label: 'Catálogo', icon: 'fa-gift' },
          { value: 'niveles',  label: 'Niveles',  icon: 'fa-medal' },
        ]} />
      </div>
      {tab === 'catalogo' && <CatalogTab />}
      {tab === 'niveles'  && <LevelsTab />}
    </Page>
  );
}

/** /admin/puntos/promociones */
export const RewardsPromotions = PromotionsTab;
/** /admin/puntos/sorteos */
export const RewardsRaffles = RafflesTab;
/** /admin/puntos/ajustes */
export const RewardsSettings = SettingsTab;
