import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('finflow_token');
        if (stored) {
          _token = stored;
          const res = await fetch(`${BASE_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (res.ok) {
            setUser(await res.json());
          } else {
            _token = null;
            await AsyncStorage.removeItem('finflow_token');
          }
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(typeof err.detail === 'string' ? err.detail : 'Login failed');
    }
    const data = await res.json();
    _token = data.access_token;
    await AsyncStorage.setItem('finflow_token', data.access_token);
    await AsyncStorage.setItem('finflow_refresh', data.refresh_token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(typeof err.detail === 'string' ? err.detail : 'Registration failed');
    }
    const data = await res.json();
    _token = data.access_token;
    await AsyncStorage.setItem('finflow_token', data.access_token);
    await AsyncStorage.setItem('finflow_refresh', data.refresh_token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    _token = null;
    await AsyncStorage.multiRemove(['finflow_token', 'finflow_refresh']);
    setUser(null);
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { user, loading, login, register, logout } },
    children
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
