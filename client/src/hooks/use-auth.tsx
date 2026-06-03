import { createContext, useContext } from 'react';
import { User } from '@/types';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** True when the initial session check failed for a non-auth reason (server/network
   * down). Distinct from `user === null`, which means genuinely not authenticated. */
  serverError: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<User>;
  resetPassword: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (email: string, displayName: string) => Promise<User>;
  updateNotificationPreferences: (prefs: NotificationPreferences) => Promise<User>;
}

export interface NotificationPreferences {
  notifyAssigned: boolean;
  notifyUnassigned: boolean;
  notifyChanged: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
