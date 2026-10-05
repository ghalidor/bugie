import { useEffect, useState } from 'react';
import { HELP_FAB } from '../../content/landing/help';
import { useLandingSettings } from './useLandingSettings';

/** Número de soporte -> enlace. Celular peruano: WhatsApp (wa.me/51…).
    Fijo: llamada (tel:+51…). Sin número: null. */
export function supportLink(phone: string, message: string): { href: string; kind: 'whatsapp' | 'tel' } | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // Con código de país (51 + 9 dígitos de celular) o número nacional.
  const national = digits.length === 11 && digits.startsWith('51') ? digits.slice(2) : digits.replace(/^0+/, '');
  if (!national) return null;
  if (/^9\d{8}$/.test(national)) {
    return { href: `https://wa.me/51${national}?text=${encodeURIComponent(message)}`, kind: 'whatsapp' };
  }
  return { href: `tel:+51${national}`, kind: 'tel' };
}

/** Botón flotante de ayuda de las páginas públicas. En pantallas chicas se
    esconde mientras el pie de página está a la vista, para no taparlo. */
export default function HelpFab() {
  const settings = useLandingSettings();
  const link = supportLink(settings?.support_phone ?? '', HELP_FAB.whatsappMessage);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setFooterVisible(e.isIntersecting), { threshold: 0 });
    io.observe(footer);
    return () => io.disconnect();
  }, [link?.href]);

  if (!link) return null;

  const isWa = link.kind === 'whatsapp';
  const label = isWa ? HELP_FAB.whatsappLabel : HELP_FAB.callLabel;

  return (
    <a
      href={link.href}
      className={`bugie-help-fab${isWa ? ' is-whatsapp' : ''}${footerVisible ? ' is-over-footer' : ''}`}
      aria-label={label}
      title={label}
      {...(isWa ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <i className={isWa ? 'fa-brands fa-whatsapp' : 'fa-solid fa-phone'} aria-hidden="true" />
      <span className="bugie-help-fab-text">{HELP_FAB.tooltip}</span>
    </a>
  );
}
