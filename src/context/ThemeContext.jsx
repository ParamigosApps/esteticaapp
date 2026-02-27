// ============================================================
//  ThemeContext.jsx — Theme automático según el SO
// ============================================================

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()
export const useTheme = () => useContext(ThemeContext)

// Detectar tema del sistema operativo
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')
  const [userChanged, setUserChanged] = useState(false)

  // ================================================
  // 1) Al iniciar la app
  // ================================================
  useEffect(() => {
    const saved = localStorage.getItem('theme')

    if (saved) {
      // Usuario eligió manualmente un tema
      setTheme(saved)
      setUserChanged(true)
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      // Tema según el SO
      const systemTheme = getSystemTheme()
      setTheme(systemTheme)
      document.documentElement.setAttribute('data-theme', systemTheme)
    }
  }, [])

  // ================================================
  // 2) Cuando el SO cambia de light ↔ dark
  // ================================================
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const handler = e => {
      if (!userChanged) {
        const newTheme = e.matches ? 'dark' : 'light'
        setTheme(newTheme)
        document.documentElement.setAttribute('data-theme', newTheme)
      }
    }

    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [userChanged])

  // ================================================
  // 3) Toggle manual (usuario)
  // ================================================
  const toggleTheme = () => {
    const nuevo = theme === 'dark' ? 'light' : 'dark'
    setTheme(nuevo)
    localStorage.setItem('theme', nuevo)
    document.documentElement.setAttribute('data-theme', nuevo)
    setUserChanged(true)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
