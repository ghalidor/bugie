import { useEffect, useState } from 'react';
import type { Tone } from '../../../components/ui';

/** Foto de perfil circular con icono de respaldo si no hay URL o falla la carga. */
export default function PersonAvatar({ url, icon, tone, size = 'lg' }: { url: string | null; icon: string; tone: Tone; size?: 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  const showImg = !!url && !broken;
  return (
    <span className={`lm-avatar ${size === 'lg' ? 'lg' : ''} ring bx-tone-${tone}`} aria-hidden="true">
      {showImg ? <img src={url!} alt="" onError={() => setBroken(true)} /> : <i className={`fa-solid ${icon}`} />}
    </span>
  );
}
