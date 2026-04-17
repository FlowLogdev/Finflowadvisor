import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const lightColors = {
  background: '#f7f6f2',
  surface: '#ffffff',
  surfaceSecondary: '#f0efe9',
  textPrimary: '#1a1a18',
  textMuted: '#6b6b63',
  border: 'rgba(0,0,0,0.08)',
  income: '#2d5a3d',
  expense: '#c84b1f',
  warning: '#b8740a',
  savings: '#1a4a8a',
  tabBar: '#ffffff',
  tabBarBorder: 'rgba(0,0,0,0.08)',
};

const darkColors = {
  background: '#1a1a18',
  surface: '#2a2a28',
  surfaceSecondary: '#333331',
  textPrimary: '#ffffff',
  textMuted: '#9a9a92',
  border: 'rgba(255,255,255,0.08)',
  income: '#43a047',
  expense: '#e57373',
  warning: '#ffb74d',
  savings: '#64b5f6',
  tabBar: '#2a2a28',
  tabBarBorder: 'rgba(255,255,255,0.08)',
};

export type ThemeColors = typeof lightColors;

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  mode: 'system',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem('finflow_theme_mode').then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem('finflow_theme_mode', m);
  };

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, isDark, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useIsDark(): boolean {
  return useContext(ThemeContext).isDark;
}
