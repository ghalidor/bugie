export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  return (
    <button
      // Antes usaba `bugie-icon-btn` (40x40 forzados) que rompía la altura
      // del resto de botones del header. Ahora usa la clase `bugie-topbar-icon-btn`
      // definida en SCSS para que tenga la MISMA altura que los demás botones.
      className="btn btn-sm btn-bugie-outline bugie-topbar-icon-btn"
      type="button"
      onClick={onToggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema"
    >
      <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`} />
    </button>
  )
}
