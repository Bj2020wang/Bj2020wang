import { useContext } from 'react';
import { sharedAccountAuthContext } from './sharedAccountAuthContext';
import type { AccountAuthContextValue } from './useAccountAuth';

/** 与登录弹窗、主界面共用同一份业务 token / 版本号 */
export function useSharedAccountAuth(): AccountAuthContextValue {
  const ctx = useContext(sharedAccountAuthContext);
  if (!ctx) {
    throw new Error('useSharedAccountAuth 必须在 AccountAuthProvider 内使用');
  }
  return ctx;
}
