import { useEffect, useState } from 'react'

const STORAGE_KEY = 'bugie_admin_theme'

export type Theme = 'light' | 'dark'

function readSaved(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/// Tema inicial: el que eligio el usuario; si nunca eligio, el del sistema.
export function initialTheme(): Theme {
  return readSaved() ?? systemTheme()
}

/// Aplica el tema al documento. `persist` = guardar como eleccion del usuario.
export function applyTheme(theme: string, persist = false): Theme {
  const t: Theme = theme === 'dark' ? 'dark' : 'light'
  document.body.setAttribute('data-theme', t)
  // Bootstrap 5.3 adapta sus propios componentes con data-bs-theme.
  document.documentElement.setAttribute('data-bs-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#100f1e' : '#5B5BD6')
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, t) } catch { /* sin almacenamiento */ }
  }
  return t
}

export default function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => { applyTheme(theme) }, [theme])

  // Si el usuario nunca eligio, seguir los cambios del sistema.
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mql) return
    const onChange = () => { if (!readSaved()) setTheme(mql.matches ? 'dark' : 'light') }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const toggle = () => setTheme(t => {
    const next: Theme = t === 'dark' ? 'light' : 'dark'
    applyTheme(next, true)
    return next
  })

  return { theme, setTheme, toggle }
}
