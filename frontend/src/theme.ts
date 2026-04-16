import { useColorScheme } from 'react-native';

const light = {
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

const dark = {
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

export type ThemeColors = typeof light;

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
