import { CSSProperties, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePermissions } from '../state/permissions';
import { NAV_SECTIONS } from './navConfig';
import { Skeleton, Tooltip } from './ui';
import { storage } from './ui/hooks';

/// Secciones plegadas por el usuario (se recuerdan en el navegador).
const CLOSED_KEY = 'bugie_nav_closed';
function readClosed(): string[] {
  try { return JSON.parse(storage.get(CLOSED_KEY) ?? '[]'); } catch { return []; }
}

/// Deja TODAS las secciones plegadas. Lo llama Login al iniciar sesión:
/// así el menú arranca ordenado y solo se ve abierta la sección de la
/// página actual.
export function resetNavSections() {
  storage.set(CLOSED_KEY, JSON.stringify(NAV_SECTIONS.filter(s => s.title).map(s => s.key)));
}

/// Menu lateral del admin, agrupado por secciones (ver navConfig.ts).
///   - Solo muestra los items cuyo permiso tiene el usuario; una seccion
///     sin items visibles se oculta entera.
///   - collapsed = solo iconos (escritorio). Cada icono muestra su nombre
///     en un tooltip.
///   - El colapso lo controla AdminShell (un unico boton en la barra superior).
///   - Cada seccion se pliega/despliega tocando su titulo (la flecha gira y
///     los items entran escalonados). La seccion de la pagina actual siempre
///     se muestra abierta y marcada.
///   - Con "menos movimiento" no hay animaciones (ver _ui.scss).

interface SidebarProps {
  collapsed?: boolean;
}

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const { has, loading } = usePermissions();
  const { pathname } = useLocation();
  const [closed, setClosed] = useState<string[]>(readClosed);

  function toggle(key: string) {
    setClosed(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      storage.set(CLOSED_KEY, JSON.stringify(next));
      return next;
    });
  }

  if (loading) {
    return (
      <nav className="bx-nav" aria-label="Menú principal" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={32} radius={10} />)}
      </nav>
    );
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + '/');

  const sections = NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(it => !it.hidden && has(it.permission)) }))
    .filter(s => s.items.length > 0);

  return (
    <nav className="bx-nav" aria-label="Menú principal">
      {sections.map((section, idx) => {
        const hasActive = section.items.some(it => isActive(it.to));
        // Con el menu en solo iconos no se pliega nada.
        const open = collapsed || !section.title || hasActive || !closed.includes(section.key);
        const itemsId = `bx-nav-items-${section.key}`;
        return (
        <div
          key={section.key}
          className={'bx-nav-section' + (hasActive ? ' has-active' : '') + (section.title ? '' : ' is-root')}
          style={{ ['--sec-color' as string]: section.color } as CSSProperties}
          role="group"
          aria-label={section.title ?? 'Inicio'}
        >
          {section.title && (
            <button type="button" className={'bx-nav-title' + (open ? ' is-open' : '')}
                    aria-expanded={open} aria-controls={itemsId} onClick={() => toggle(section.key)}
                    disabled={hasActive} title={hasActive ? 'Aquí está la página actual' : undefined}>
              <span className="bx-nav-title-dot" aria-hidden="true" />
              <span className="bx-nav-title-text">{section.title}</span>
              {!open && <span className="bx-nav-count" aria-hidden="true">{section.items.length}</span>}
              <i className="fa-solid fa-chevron-right bx-nav-chevron" aria-hidden="true" />
            </button>
          )}
          {collapsed && idx > 0 && <div className="bx-nav-divider d-none d-lg-block" aria-hidden="true" />}
          {/* Grilla 0fr→1fr: pliega/despliega con altura suave */}
          <div id={itemsId} className={'bx-nav-items' + (open ? ' is-open' : '')}>
            <div>
              {section.items.map((it, i) => (
                <Tooltip key={it.to} content={it.label} placement="right" disabled={!collapsed}>
                  <NavLink to={it.to} end={it.to === '/admin/dashboard'} className="bx-nav-item"
                           style={{ ['--i' as string]: i } as CSSProperties}
                           aria-label={collapsed ? it.label : undefined}>
                    <i className={`fa-solid ${it.icon}`} aria-hidden="true" />
                    <span className="label">{it.label}</span>
                  </NavLink>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
        );
      })}
    </nav>
  );
}
