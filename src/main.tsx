import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AccountAuthProvider } from './features/account/AccountAuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountAuthProvider>
        <App />
      </AccountAuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
