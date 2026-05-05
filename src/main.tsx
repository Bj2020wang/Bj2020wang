import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AccountAuthProvider } from './features/account/AccountAuthContext'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountAuthProvider>
        <App />
      </AccountAuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
