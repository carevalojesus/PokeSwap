import type { ProfileUpdate } from '../../../shared/schemas/profile';
import { createContext, useContext } from 'react';
import type { AuthenticatedProfile } from '../../../shared/contracts/auth';
import type { LoginInput } from '../../../shared/schemas/auth';
import type { RegistrationInput } from '../../../shared/schemas/registration';

export type SessionAction = 'idle' | 'auth' | 'logout' | 'logout-failed';
export const SessionContext = createContext<{
  profile: AuthenticatedProfile | null;
  retainedProfile: AuthenticatedProfile | null;
  updateProfile: (input?: ProfileUpdate) => Promise<AuthenticatedProfile>;
  canSignOut: boolean;
  loading: boolean;
  failed: boolean;
  action: SessionAction;
  retry: () => void;
  signIn: (
    kind: 'login' | 'register',
    input: LoginInput | RegistrationInput,
  ) => Promise<AuthenticatedProfile>;
  signOut: () => Promise<boolean>;
} | null>(null);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
