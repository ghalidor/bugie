import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

import './styles/index.scss'
import '@fortawesome/fontawesome-free/css/all.min.css'
import App from './App'
import { applyTheme } from './hooks/useTheme'

// Aplicar tema guardado — default siempre light
const savedTheme = localStorage.getItem('bugie_admin_theme')
applyTheme(savedTheme === 'dark' ? 'dark' : 'light')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
