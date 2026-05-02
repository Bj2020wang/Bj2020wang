import { type ReactNode } from 'react';
import { sharedAccountAuthContext } from './sharedAccountAuthContext';
import { useAccountAuth } from './useAccountAuth';

export function AccountAuthProvider({ children }: { children: ReactNode }) {
  const value = useAccountAuth();
  return (
    <sharedAccountAuthContext.Provider value={value}>{children}</sharedAccountAuthContext.Provider>
  );
}
