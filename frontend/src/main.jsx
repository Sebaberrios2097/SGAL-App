import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { OrganizationProvider } from './context/OrganizationContext.jsx'
import NotificationCenter from './components/NotificationCenter.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OrganizationProvider>
      <App />
      <NotificationCenter />
    </OrganizationProvider>
  </StrictMode>,
)
