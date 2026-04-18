import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, ThemeMode } from '../src/theme';
import { getSettings, updateSettings, resetAllData } from '../src/api';
import { CURRENCIES } from '../src/types';

export default function SettingsScreen() {
  const { colors: c, mode, setMode } = useTheme();
  const router = useRouter();
  const [currency, setCurrency] = useState('$');

  useEffect(() => {
    getSettings().then((s) => setCurrency(s.currency)).catch(() => {});
  }, []);

  const changeCurrency = async (sym: string) => {
    setCurrency(sym);
    const s = await getSettings();
    await updateSettings({ ...s, currency: sym });
  };

  const handleReset = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all your bills, expenses, savings goals, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await resetAllData();
            await AsyncStorage.removeItem('finflow_onboarding_complete');
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  const MODES: { key: ThemeMode; label: string; icon: string }[] = [
    { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="settings-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Theme */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                testID={`theme-${m.key}-btn`}
                onPress={() => setMode(m.key)}
                style={[
                  styles.modePill,
                  {
                    backgroundColor: mode === m.key ? c.income : c.surfaceSecondary,
                    borderColor: mode === m.key ? c.income : c.border,
                  },
                ]}
              >
                <Ionicons name={m.icon as any} size={16} color={mode === m.key ? '#fff' : c.textPrimary} />
                <Text style={[styles.modeText, { color: mode === m.key ? '#fff' : c.textPrimary }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Currency */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Currency</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((cur) => (
              <TouchableOpacity
                key={cur.symbol}
                testID={`settings-currency-${cur.symbol}`}
                onPress={() => changeCurrency(cur.symbol)}
                style={[
                  styles.currencyPill,
                  {
                    backgroundColor: currency === cur.symbol ? c.income : c.surfaceSecondary,
                    borderColor: currency === cur.symbol ? c.income : c.border,
                  },
                ]}
              >
                <Text style={[styles.currencyText, { color: currency === cur.symbol ? '#fff' : c.textPrimary }]}>
                  {cur.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Data */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Data</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity testID="reset-data-btn" onPress={handleReset} style={styles.resetRow}>
            <Ionicons name="trash-outline" size={20} color={c.expense} />
            <Text style={[styles.resetText, { color: c.expense }]}>Reset All Data</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>About</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: c.textPrimary }]}>FinFlow</Text>
            <Text style={[styles.aboutValue, { color: c.textMuted }]}>v1.0.0</Text>
          </View>
          <View style={[styles.aboutRow, { borderTopWidth: 0.5, borderTopColor: c.border }]}>
            <Text style={[styles.aboutLabel, { color: c.textPrimary }]}>Built with</Text>
            <Text style={[styles.aboutValue, { color: c.textMuted }]}>Expo + React Native</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 8 },
  headerTitle: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  scroll: { padding: 24, paddingBottom: 48 },
  sectionLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 8, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modePill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 0.5, gap: 6 },
  modeText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currencyPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 0.5 },
  currencyText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resetText: { fontFamily: 'DMSans_500Medium', fontSize: 15 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  aboutLabel: { fontFamily: 'DMSans_500Medium', fontSize: 15 },
  aboutValue: { fontFamily: 'DMSans_400Regular', fontSize: 14 },
});
