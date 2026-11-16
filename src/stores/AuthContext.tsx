import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { signInWithGooglePopup, signOutFirebase, testFirestoreConnection } from '../lib/firebase';
import type { AgentDTO, SessionDevice } from '../models/types';
import {
  ApiError,
  apiClient,
  getClientPlatform,
  getStoredToken,
  isNetworkError,
  setStoredToken,
  setUnauthorizedHandler,
} from '../services/apiClient';
import {
  cacheUserProfile,
  clearCachedUserProfile,
  loadCachedUserProfile,
} from '../services/offlineSyncService';
import { getOrCreateDeviceId } from '../utils/formatters';

interface AuthContextValue {
  user: AgentDTO | null;
  sessions: SessionDevice[];
  loading: boolean;
  authError: string | null;
  isOnline: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const THEME_KEY = 'sonelgaz_sa_theme';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AgentDTO | null>(null);
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      setUser(null);
      setSessions([]);
      void clearCachedUserProfile();
      setAuthError(message);
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      const data = await apiClient.getMe();
      setUser(data.user);
      setSessions(data.sessions);
      await cacheUserProfile(data.user);
      setAuthError(null);
    } catch (err) {
      if (isNetworkError(err)) {
        const cachedUser = await loadCachedUserProfile();
        if (cachedUser) {
          setUser(cachedUser);
          setAuthError(null);
          return;
        }
      }
      setStoredToken(null);
      setUser(null);
      setSessions([]);
      if (err instanceof ApiError) {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    testFirestoreConnection();
    refreshProfile();
  }, [refreshProfile]);

  const loginWithCredentials = async (identifier: string, password: string) => {
    setAuthError(null);
    const deviceId = getOrCreateDeviceId();
    const res = await apiClient.loginWithCredentials({
      identifier,
      password,
      device_id: deviceId,
      plateforme: getClientPlatform(),
    });
    setStoredToken(res.token);
    setUser(res.user);
    await cacheUserProfile(res.user);
    const me = await apiClient.getMe();
    setSessions(me.sessions);
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    const idToken = await signInWithGooglePopup();
    const deviceId = getOrCreateDeviceId();
    const res = await apiClient.loginWithFirebase({
      idToken,
      device_id: deviceId,
      plateforme: getClientPlatform(),
    });
    setStoredToken(res.token);
    setUser(res.user);
    await cacheUserProfile(res.user);
    const me = await apiClient.getMe();
    setSessions(me.sessions);
  };

  const logout = async () => {
    try {
      if (getStoredToken()) {
        await apiClient.logout();
      }
    } catch {
      // ignore logout network errors
    }
    try {
      await signOutFirebase();
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setSessions([]);
    await clearCachedUserProfile();
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        sessions,
        loading,
        authError,
        isOnline,
        theme,
        toggleTheme,
        loginWithCredentials,
        loginWithGoogle,
        logout,
        refreshProfile,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
