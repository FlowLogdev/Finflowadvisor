import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../theme';

export function FinFlowLogo({ size = 52 }: { size?: number }) {
  const { colors: c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="4" y="4" width="92" height="92" rx="22" fill={c.income} />
      {/* Upward flow line */}
      <Path
        d="M 28 72 C 38 55, 45 45, 55 38 C 62 33, 68 28, 72 24"
        stroke="#fff"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arrow head */}
      <Path
        d="M 62 21 L 74 24 L 70 36"
        stroke="#fff"
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Subtle lower wave */}
      <Path
        d="M 24 62 Q 38 56, 50 60 Q 62 64, 76 58"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function LogoWithName({ size = 52 }: { size?: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.logoRow}>
      <FinFlowLogo size={size} />
      <View style={styles.logoTextWrap}>
        <Text style={[styles.logoName, { color: c.textPrimary }]}>
          Fin<Text style={{ color: c.income }}>Flow</Text>
        </Text>
        <Text style={[styles.logoTagline, { color: c.textMuted }]}>Personal Finance</Text>
      </View>
    </View>
  );
}

export function ThemeToggle() {
  const { colors: c, isDark, mode, setMode } = useTheme();
  const nextMode = isDark ? 'light' : 'dark';
  const icon = isDark ? 'sunny-outline' : 'moon-outline';
  const label = isDark ? 'Light' : 'Dark';

  return (
    <TouchableOpacity
      testID="theme-toggle-btn"
      onPress={() => setMode(nextMode)}
      style={[styles.toggleBtn, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
      activeOpacity={0.7}
    >
      <Ionicons name={icon as any} size={18} color={c.textPrimary} />
      <Text style={[styles.toggleLabel, { color: c.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function LogoHeader({ size = 48 }: { size?: number }) {
  return (
    <View style={styles.header}>
      <LogoWithName size={size} />
      <ThemeToggle />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoTextWrap: {},
  logoName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 26,
    lineHeight: 32,
  },
  logoTagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    marginTop: 1,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 0.5,
  },
  toggleLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
  },
});
