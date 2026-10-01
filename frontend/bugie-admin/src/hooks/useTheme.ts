import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'bugie_admin_theme'

export function applyTheme(theme: string) {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.body.setAttribute('data-theme', t)
  localStorage.setItem(STORAGE_KEY, t)
  return t
}

export default function useTheme() {
  // Default: light — el usuario elige dark si quiere
  const initial = useMemo(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'dark' ? 'dark' : 'light'
  }, [])

  const [theme, setTheme] = useState<'light' | 'dark'>(initial as 'light' | 'dark')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, setTheme, toggle }
}
