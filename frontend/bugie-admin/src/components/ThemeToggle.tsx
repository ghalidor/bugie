interface Props {
  theme: string;
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  const isDark = theme === 'dark'
  return (
    <button
      className="bx-icon-btn"
      type="button"
      onClick={onToggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`} />
    </button>
  )
}
