import { createContext, useContext, type ReactNode } from 'react';
import { useAccountAuth } from './useAccountAuth';

type AccountAuthContextValue = ReturnType<typeof useAccountAuth>;

const AccountAuthContext = createContext<AccountAuthContextValue | null>(null);

export function AccountAuthProvider({ children }: { children: ReactNode }) {
  const value = useAccountAuth();
  return <AccountAuthContext.Provider value={value}>{children}</AccountAuthContext.Provider>;
}

/** 与登录弹窗、主界面共用同一份业务 token / 版本号 */
export function useSharedAccountAuth(): AccountAuthContextValue {
  const ctx = useContext(AccountAuthContext);
  if (!ctx) {
    throw new Error('useSharedAccountAuth 必须在 AccountAuthProvider 内使用');
  }
  return ctx;
}
