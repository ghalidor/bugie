import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'bugie_theme'

export function applyTheme(theme: string | null) {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.body.setAttribute('data-theme', t)
  localStorage.setItem(STORAGE_KEY, t)
  return t
}

export default function useTheme() {
  const initial = useMemo(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'dark' ? 'dark' : 'light'
  }, [])

  const [theme, setTheme] = useState(initial)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, setTheme, toggle }
}
