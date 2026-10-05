import { Link, NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { NAV_LANGUAGES, NAV_LINKS, NAV_TEXT } from '../content/landing/nav';

interface Props {
  lang?: string;
  onLangChange?: (lang: string) => void;
  theme?: string;
  onThemeToggle?: () => void;
}

/** Menú superior de la landing. Enlaces e idiomas en src/content/landing/nav.ts.
    Desde 1200px se ven los enlaces; por debajo, el botón de menú abre el
    panel lateral (offcanvas). */
export default function PublicTopNav({ lang = 'es', onLangChange, theme, onThemeToggle }: Props) {
  return (
    <>
    <div className="bugie-topbar">
      <div className="container bugie-container py-3 d-flex align-items-center justify-content-between gap-3">

        {/* Logo */}
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-bugie-outline d-xl-none bugie-icon-btn"
            type="button" data-bs-toggle="offcanvas" data-bs-target="#publicNav">
            <i className="fa-solid fa-bars" />
          </button>
          <Link to="/" className="text-decoration-none d-flex align-items-center gap-3">
            <img src="/bugie.png" alt="Bugie" className="bugie-nav-logo" />
            <span className="bugie-chip d-none d-sm-inline-flex">
              <i className="fa-solid fa-shield-halved text-bugie-accent" /> {NAV_TEXT.chip}
            </span>
          </Link>
        </div>

        {/* Nav links */}
        <div className="d-none d-xl-flex align-items-center gap-1">
          {NAV_LINKS.map(l => (
            <NavLink className="bugie-navlink" to={l.href} key={l.href} end={l.href === '/'}>
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Derecha */}
        <div className="d-flex gap-2 align-items-center">
          {/* Idioma — dropdown compacto. Altura uniforme con los otros botones
              via .bugie-topbar .btn { height: 36px } en SCSS. */}
          {onLangChange && (
            <div className="dropdown d-none d-md-block">
              <button
                className="btn btn-sm btn-bugie-outline dropdown-toggle bugie-lang-btn"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false">
                <i className="fa-solid fa-globe" />
                <span>{lang.toUpperCase()}</span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end bugie-lang-menu">
                {NAV_LANGUAGES.map(l => (
                  <li key={l.code}>
                    <button type="button"
                      className={`dropdown-item bugie-lang-item ${lang === l.code ? 'active' : ''}`}
                      onClick={() => onLangChange(l.code)}>
                      <span>{l.label}</span>
                      {lang === l.code && <i className="fa-solid fa-check ms-auto" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Theme toggle — mismo alto que los demás (36px) */}
          {onThemeToggle && theme && (
            <ThemeToggle theme={theme} onToggle={onThemeToggle} />
          )}
          {/* Botón Ingresar — gradiente violeta. El SCSS le asegura alto 36px
              y centrado del icono. */}
          <Link className="btn btn-sm btn-bugie text-white d-none d-sm-inline-flex bugie-login-btn"
                to="/auth/login">
            <i className="fa-solid fa-arrow-right-to-bracket" />
            <span>{NAV_TEXT.login}</span>
          </Link>
        </div>
      </div>

    </div>

      {/* Offcanvas mobile.
          Va FUERA de .bugie-topbar a proposito: la barra tiene backdrop-filter,
          y eso vuelve a la barra el contenedor de los hijos position:fixed.
          Si el menu estuviera adentro, quedaria atrapado en los 68px de la barra.
          Es el mismo patron que usa AppShell.tsx en el area logueada. */}
      <div className="offcanvas offcanvas-start bugie-offcanvas" tabIndex={-1} id="publicNav" aria-labelledby="publicNavLabel">
        <div className="offcanvas-header">
          <img src="/bugie.png" alt="Bugie" className="bugie-offcanvas-logo" />
          <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close" />
        </div>
        <div className="offcanvas-body d-flex flex-column gap-2">
          {/* data-bs-dismiss va en este <div> y NO en cada enlace: Bootstrap
              cancela el clic (preventDefault) cuando el elemento con
              data-bs-dismiss es un <a>, y entonces React Router no navega.
              Sobre un <div>, Bootstrap cierra el menu y deja pasar el clic. */}
          <div className="d-flex flex-column gap-2" data-bs-dismiss="offcanvas">
            {NAV_LINKS.map(l => (
              <NavLink className="bugie-sidebar-link" to={l.href} key={l.href} end={l.href === '/'}>
                <i className="fa-solid fa-chevron-right" />
                <span>{l.label}</span>
              </NavLink>
            ))}
          </div>
          {onLangChange && (
            <div className="d-flex gap-2 mt-2">
              {NAV_LANGUAGES.map(l => (
                <button key={l.code} onClick={() => onLangChange(l.code)}
                  className={`btn btn-sm ${lang === l.code ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}>
                  {l.short}
                </button>
              ))}
            </div>
          )}
          <div className="bugie-divider my-3" />
          <div className="d-flex flex-column gap-2" data-bs-dismiss="offcanvas">
            <Link className="btn btn-bugie-outline" to="/auth/login">{NAV_TEXT.login}</Link>
            <Link className="btn btn-bugie text-white" to="/auth/registro">{NAV_TEXT.register}</Link>
          </div>
          <div className="mt-auto pt-3 border-top">
            <a href={NAV_TEXT.adminHref}
              className="small bugie-muted text-decoration-none d-flex align-items-center gap-2 bugie-offcanvas-admin">
              <i className="fa-solid fa-lock" />
              {NAV_TEXT.adminLabel}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
