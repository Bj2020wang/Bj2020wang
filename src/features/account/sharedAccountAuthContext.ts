import { createContext } from 'react';
import type { AccountAuthContextValue } from './useAccountAuth';

export const sharedAccountAuthContext = createContext<AccountAuthContextValue | null>(null);
