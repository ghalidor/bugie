import { useLandingContent } from '../../hooks/useLandingContent';
import {
  HOME_HERO, HOME_FEATURES, HOME_STATS, HOME_REWARDS, HOME_TESTIMONIALS, HOME_CTA,
} from '../../content/landing/home';
import HeroSection from '../../components/landing/home/HeroSection';
import FeaturesSection from '../../components/landing/home/FeaturesSection';
import StatsSection from '../../components/landing/home/StatsSection';
import RewardsSection from '../../components/landing/home/RewardsSection';
import TestimonialsSection from '../../components/landing/home/TestimonialsSection';
import CtaSection from '../../components/landing/home/CtaSection';

/** Página de inicio. Los textos están en src/content/landing/home.ts
    y se pueden reemplazar desde el gestor de la landing. */
export default function Home() {
  const { lang, section } = useLandingContent();

  return (
    <>
      <HeroSection         hero={section('hero', HOME_HERO)} />
      <FeaturesSection     features={section('features', HOME_FEATURES)} />
      <StatsSection        stats={section('stats', HOME_STATS)} lang={lang} />
      <RewardsSection      rewards={section('rewards', HOME_REWARDS)} lang={lang} />
      <TestimonialsSection testimonials={section('testimonials', HOME_TESTIMONIALS)} />
      <CtaSection          cta={section('cta', HOME_CTA)} />
    </>
  );
}
