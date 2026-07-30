import { createContext, useContext } from 'react';
import type { UserRole } from '@/types';

interface SessionContextValue {
  role: UserRole | null;
}

export const SessionContext = createContext<SessionContextValue>({ role: null });

export function useSession() {
  return useContext(SessionContext);
}
