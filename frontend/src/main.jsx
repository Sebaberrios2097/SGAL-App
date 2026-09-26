import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { OrganizationProvider } from './context/OrganizationContext.jsx'
import NotificationCenter from './components/NotificationCenter.jsx'

// Informa inmediatamente a la UI cuando cualquier endpoint es bloqueado por la licencia.
// Se conserva la Response original para que cada pantalla siga manejando su solicitud normalmente.
const nativeFetch = window.fetch.bind(window)
window.fetch = async (...args) => {
  const response = await nativeFetch(...args)
  if (response.status === 402) {
    const detail = await response.clone().json().catch(() => ({}))
    window.dispatchEvent(new CustomEvent('sgal:license-blocked', { detail }))
  }
  return response
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OrganizationProvider>
      <App />
      <NotificationCenter />
    </OrganizationProvider>
  </StrictMode>,
)
