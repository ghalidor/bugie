import { Link, NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

interface Props {
  lang?: string;
  onLangChange?: (lang: string) => void;
  theme?: string;
  onThemeToggle?: () => void;
}

const NAV_LINKS = [
  ['Inicio',          '/'],
  ['Empresa',         '/empresa'],
  ['Seguridad',       '/seguridad'],
  ['Comunidad',       '/comunidad'],
  ['Gana con Bugie',  '/gana-con-bugie'],
  ['Contacto',        '/contacto'],
] as const;

export default function PublicTopNav({ lang = 'es', onLangChange, theme, onThemeToggle }: Props) {
  return (
    <>
    <div className="bugie-topbar">
      <div className="container bugie-container py-3 d-flex align-items-center justify-content-between gap-3">

        {/* Logo */}
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-bugie-outline d-md-none bugie-icon-btn"
            type="button" data-bs-toggle="offcanvas" data-bs-target="#publicNav">
            <i className="fa-solid fa-bars" />
          </button>
          <Link to="/" className="text-decoration-none d-flex align-items-center gap-3">
            <img src="/bugie.png" alt="Bugie" style={{ height: 32, width: "auto", objectFit: "contain" }} />
            <span className="bugie-chip d-none d-sm-inline-flex">
              <i className="fa-solid fa-shield-halved text-bugie-accent" /> Transporte seguro
            </span>
          </Link>
        </div>

        {/* Nav links */}
        <div className="d-none d-md-flex align-items-center gap-1">
          {NAV_LINKS.map(([label, href]) => (
            <NavLink className="bugie-navlink" to={href} key={href} end={href === '/'}>
              {label}
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
                className="btn btn-sm btn-bugie-outline dropdown-toggle"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                style={{ fontSize: '0.78rem', padding: '0 .75rem', gap: '.5rem' }}>
                <i className="fa-solid fa-globe" />
                <span style={{ fontWeight: 600 }}>{lang.toUpperCase()}</span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end bugie-lang-menu">
                {[['es','🇵🇪 Español'], ['en','🇺🇸 English'], ['pt','🇧🇷 Português']].map(([l, label]) => (
                  <li key={l}>
                    <button type="button"
                      className={`dropdown-item bugie-lang-item ${lang === l ? 'active' : ''}`}
                      onClick={() => onLangChange(l)}>
                      <span>{label}</span>
                      {lang === l && <i className="fa-solid fa-check ms-auto" />}
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
          <Link className="btn btn-sm btn-bugie text-white d-none d-sm-inline-flex"
                to="/auth/login"
                style={{ padding: '0 1rem', gap: '.5rem' }}>
            <i className="fa-solid fa-arrow-right-to-bracket" />
            <span>Ingresar</span>
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
          <img src="/bugie.png" alt="Bugie" style={{ height: 28, width: "auto", objectFit: "contain" }} />
          <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close" />
        </div>
        <div className="offcanvas-body d-flex flex-column gap-2">
          {/* data-bs-dismiss va en este <div> y NO en cada enlace: Bootstrap
              cancela el clic (preventDefault) cuando el elemento con
              data-bs-dismiss es un <a>, y entonces React Router no navega.
              Sobre un <div>, Bootstrap cierra el menu y deja pasar el clic. */}
          <div className="d-flex flex-column gap-2" data-bs-dismiss="offcanvas">
            {NAV_LINKS.map(([label, href]) => (
              <NavLink className="bugie-sidebar-link" to={href} key={href} end={href === '/'}>
                <i className="fa-solid fa-chevron-right" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          {onLangChange && (
            <div className="d-flex gap-2 mt-2">
              {[['es','🇵🇪 ES'],['en','🇺🇸 EN'],['pt','🇧🇷 PT']].map(([l, label]) => (
                <button key={l} onClick={() => onLangChange(l)}
                  className={`btn btn-sm ${lang === l ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="bugie-divider my-3" />
          <div className="d-flex flex-column gap-2" data-bs-dismiss="offcanvas">
            <Link className="btn btn-bugie-outline" to="/auth/login">Ingresar</Link>
            <Link className="btn btn-bugie text-white" to="/auth/registro">Crear cuenta</Link>
          </div>
          <div className="mt-auto pt-3 border-top">
            <a href="http://localhost:5174/auth/login"
              className="small bugie-muted text-decoration-none d-flex align-items-center gap-2">
              <i className="fa-solid fa-lock" style={{ fontSize: '0.7rem' }} />
              Acceso panel administrativo
            </a>
          </div>
        </div>
      </div>
    </>
  );
}