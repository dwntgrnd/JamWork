import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<User>;
  resetPassword: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (email: string, displayName: string) => Promise<User>;
  updateNotificationPreferences: (prefs: NotificationPreferences) => Promise<User>;
}

interface NotificationPreferences {
  notifyAssigned: boolean;
  notifyUnassigned: boolean;
  notifyChanged: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiGet<{ user: User }>('/auth/me');
        setUser(response.user);
      } catch (error) {
        // Not authenticated or session expired
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const response = await apiPost<{ user: User }>('/auth/login', { email, password });
    setUser(response.user);
    return response.user;
  };

  const logout = async (): Promise<void> => {
    await apiPost('/auth/logout');
    setUser(null);
  };

  const signup = async (email: string, password: string, displayName: string): Promise<User> => {
    const response = await apiPost<{ user: User }>('/auth/signup', {
      email,
      password,
      displayName,
    });
    setUser(response.user);
    return response.user;
  };

  const resetPassword = async (newPassword: string): Promise<void> => {
    await apiPut('/auth/reset-password', { newPassword });
    // Update user state to clear mustResetPassword flag
    if (user) {
      setUser({ ...user, mustResetPassword: false });
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiPut('/auth/change-password', { currentPassword, newPassword });
  };

  const updateProfile = async (email: string, displayName: string): Promise<User> => {
    const response = await apiPut<{ user: User }>('/auth/profile', { email, displayName });
    setUser(response.user);
    return response.user;
  };

  const updateNotificationPreferences = async (prefs: NotificationPreferences): Promise<User> => {
    const response = await apiPut<{ user: User }>('/auth/profile', prefs);
    setUser(response.user);
    return response.user;
  };

  const value = {
    user,
    loading,
    login,
    logout,
    signup,
    resetPassword,
    changePassword,
    updateProfile,
    updateNotificationPreferences,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
