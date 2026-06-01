import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AccountAuthProvider } from './features/account/AccountAuthContext'
import { detectWechatCallback, persistWechatSession } from './features/account/wechatLogin';
import { WECHAT_LOGIN_ERROR_KEY } from './features/account/config';

registerSW({ immediate: true })

// 在 React 挂载前检测微信登录回调，将 token/email 写入 sessionStorage
const wechatResult = detectWechatCallback();
if (wechatResult) {
  if ('token' in wechatResult && wechatResult.token) {
    persistWechatSession(wechatResult);
  } else if ('error' in wechatResult && wechatResult.error) {
    try { sessionStorage.setItem(WECHAT_LOGIN_ERROR_KEY, wechatResult.error); } catch { /* ignore */ }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountAuthProvider>
        <App />
      </AccountAuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
