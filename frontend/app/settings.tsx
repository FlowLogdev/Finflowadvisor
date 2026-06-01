import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTheme, ThemeMode } from '../src/theme';
import { useI18n, LANGUAGES, LanguageCode } from '../src/i18n';
import { getSettings, updateSettings, resetAllData } from '../src/api';
import { getBillingMe, cancelSubscription, BillingMe } from '../src/featuresApi';
import { generateExport } from '../src/localFeaturesApi';
import { useAuth } from '../src/auth';
import { Platform } from 'react-native';
import { CURRENCIES } from '../src/types';

export default function SettingsScreen() {
  const { colors: c, mode, setMode } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();
  const [currency, setCurrency] = useState('$');
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => setCurrency(s.currency)).catch(() => {});
    getBillingMe().then(setBilling).catch(() => setBilling({ premium: false }));
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

  const handleEmailExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      const file = await generateExport(format);
      if (Platform.OS === 'web') {
        // Web: trigger download via anchor
        const byteChars = atob(file.base64_data);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr], { type: file.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Native: save to cache, then open share sheet
        const path = `${FileSystem.cacheDirectory}${file.filename}`;
        await FileSystem.writeAsStringAsync(path, file.base64_data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert('Saved', `File saved to: ${path}`);
          return;
        }
        await Sharing.shareAsync(path, {
          mimeType: file.mime,
          dialogTitle: `Share ${format.toUpperCase()} export`,
          UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'org.openxmlformats.spreadsheetml.sheet',
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not generate export');
    } finally {
      setExporting(null);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel subscription?',
      'You\'ll keep access until the end of your billing period. You can resubscribe anytime.',
      [
        { text: 'Keep Premium', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription();
              const me = await getBillingMe().catch(() => ({ premium: false }));
              setBilling(me);
              Alert.alert('Canceled', 'Your subscription has been canceled.');
            } catch (e: any) {
              Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not cancel');
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/landing' as any); } },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'All your bills, expenses, goals, and history will be permanently erased.',
              [
                { text: 'Keep Account', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      router.replace('/landing' as any);
                    } catch (e: any) {
                      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not delete account. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@finflow.com';

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
        {/* Premium status / CTA */}
        {billing?.premium ? (
          <View style={[styles.premiumCard, { backgroundColor: c.income }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.premiumTitle}>Premium</Text>
              </View>
              {billing.premium_until && (
                <Text style={styles.premiumSub}>
                  Renews {new Date(billing.premium_until).toLocaleDateString()}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={handleCancelSubscription} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.upgradeCard, { backgroundColor: c.income }]}
            onPress={() => router.push('/premium' as any)}
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Go Premium</Text>
              <Text style={styles.upgradeSub}>Unlock AI, exports, and more from $9.99/mo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Support & Data</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/support' as any)}>
            <Ionicons name="help-buoy-outline" size={20} color={c.income} />
            <Text style={[styles.actionText, { color: c.textPrimary }]}>Contact Support</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderTopWidth: 0.5, borderTopColor: c.border }]}
            onPress={() => handleEmailExport('csv')}
            disabled={exporting !== null}
          >
            <Ionicons name="document-text-outline" size={20} color={c.income} />
            <Text style={[styles.actionText, { color: c.textPrimary }]}>Export CSV (Share)</Text>
            {exporting === 'csv' ? <ActivityIndicator size="small" color={c.income} /> : <Ionicons name="share-outline" size={16} color={c.textMuted} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderTopWidth: 0.5, borderTopColor: c.border }]}
            onPress={() => handleEmailExport('xlsx')}
            disabled={exporting !== null}
          >
            <Ionicons name="grid-outline" size={20} color={c.income} />
            <Text style={[styles.actionText, { color: c.textPrimary }]}>Export Excel (Share)</Text>
            {exporting === 'xlsx' ? <ActivityIndicator size="small" color={c.income} /> : <Ionicons name="share-outline" size={16} color={c.textMuted} />}
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={[styles.actionRow, { borderTopWidth: 0.5, borderTopColor: c.border }]}
              onPress={() => router.push('/admin-tickets' as any)}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={c.warning} />
              <Text style={[styles.actionText, { color: c.textPrimary }]}>Admin · Support Tickets</Text>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Language */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{t('settings.language')}</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.modeRow}>
            {LANGUAGES.map((L) => (
              <TouchableOpacity
                key={L.code}
                testID={`lang-${L.code}-btn`}
                onPress={() => setLanguage(L.code as LanguageCode)}
                style={[
                  styles.modePill,
                  {
                    backgroundColor: language === L.code ? c.income : c.surfaceSecondary,
                    borderColor: language === L.code ? c.income : c.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>{L.emoji}</Text>
                <Text style={[styles.modeText, { color: language === L.code ? '#fff' : c.textPrimary }]}>{L.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Theme */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{t('settings.appearance')}</Text>
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

        {/* Account */}
        {user && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Account</Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
              <TouchableOpacity testID="logout-btn" onPress={handleLogout} style={styles.actionRow}>
                <Ionicons name="log-out-outline" size={20} color={c.textMuted} />
                <Text style={[styles.actionText, { color: c.textPrimary }]}>Log Out</Text>
                <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="delete-account-btn"
                onPress={handleDeleteAccount}
                style={[styles.actionRow, { borderTopWidth: 0.5, borderTopColor: c.border }]}
              >
                <Ionicons name="person-remove-outline" size={20} color={c.expense} />
                <Text style={[styles.actionText, { color: c.expense }]}>Delete Account</Text>
                <Ionicons name="chevron-forward" size={16} color={c.expense} />
              </TouchableOpacity>
            </View>
          </>
        )}

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

  // Premium / Upgrade
  premiumCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 14, marginBottom: 20,
  },
  premiumTitle: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  premiumSub: { color: '#fff', fontFamily: 'DMSans_400Regular', fontSize: 12, opacity: 0.9, marginTop: 2 },
  cancelLink: { paddingHorizontal: 10, paddingVertical: 6 },
  cancelLinkText: { color: '#fff', fontFamily: 'DMSans_600SemiBold', fontSize: 12, textDecorationLine: 'underline' },

  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 14, marginBottom: 20,
  },
  upgradeTitle: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  upgradeSub: { color: '#fff', fontFamily: 'DMSans_400Regular', fontSize: 12, opacity: 0.9, marginTop: 2 },

  // Support & data rows
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  actionText: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 14 },
});
