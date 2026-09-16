import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { OrganizationProvider } from './context/OrganizationContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OrganizationProvider>
      <App />
    </OrganizationProvider>
  </StrictMode>,
)
