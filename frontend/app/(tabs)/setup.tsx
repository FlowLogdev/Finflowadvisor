import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useThemeColors } from '../../src/theme';
import { getSettings, updateSettings } from '../../src/api';
import { CURRENCIES, Settings } from '../../src/types';
import { LogoHeader } from '../../src/components/LogoHeader';

export default function SetupScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salary, setSalary] = useState('5000');
  const [currency, setCurrency] = useState<string>('$');
  const [pctNeeds, setPctNeeds] = useState('50');
  const [pctWants, setPctWants] = useState('30');
  const [pctSavings, setPctSavings] = useState('20');

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  const loadSettings = async () => {
    try {
      const s: Settings = await getSettings();
      setSalary(String(s.salary));
      setCurrency(s.currency);
      setPctNeeds(String(s.pctNeeds));
      setPctWants(String(s.pctWants));
      setPctSavings(String(s.pctSavings));
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({
        salary: parseFloat(salary) || 0,
        currency,
        pctNeeds: parseFloat(pctNeeds) || 0,
        pctWants: parseFloat(pctWants) || 0,
        pctSavings: parseFloat(pctSavings) || 0,
      });
    } catch (e) {
      console.error('Failed to save settings', e);
    } finally {
      setSaving(false);
    }
  };

  const salaryNum = parseFloat(salary) || 0;
  const needsAmt = salaryNum * (parseFloat(pctNeeds) || 0) / 100;
  const wantsAmt = salaryNum * (parseFloat(pctWants) || 0) / 100;
  const savingsAmt = salaryNum * (parseFloat(pctSavings) || 0) / 100;
  const totalPct = (parseFloat(pctNeeds) || 0) + (parseFloat(pctWants) || 0) + (parseFloat(pctSavings) || 0);

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.income} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <LogoHeader size={44} />

          <Text style={[styles.subtitle, { color: c.textMuted }]}>Configure your monthly budget</Text>

          <TouchableOpacity
            testID="setup-go-premium"
            style={styles.premiumBanner}
            onPress={() => router.push('/premium')}
            activeOpacity={0.85}
          >
            <View style={styles.premiumBannerLeft}>
              <Text style={styles.premiumBannerCrown}>👑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.premiumBannerTitle}>Go Premium</Text>
                <Text style={styles.premiumBannerSubtitle}>
                  Unlock AI advisor, unlimited exports & Lifetime plan
                </Text>
              </View>
            </View>
            <Text style={styles.premiumBannerArrow}>→</Text>
          </TouchableOpacity>

          {/* Salary */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.label, { color: c.textMuted }]}>Monthly Net Salary</Text>
            <View style={styles.salaryRow}>
              <Text style={[styles.currencySymbol, { color: c.income }]}>{currency}</Text>
              <TextInput
                testID="salary-input"
                style={[styles.salaryInput, { color: c.textPrimary }]}
                value={salary}
                onChangeText={setSalary}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={c.textMuted}
              />
            </View>
          </View>

          {/* Currency */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.label, { color: c.textMuted }]}>Currency</Text>
            <View style={styles.pillRow}>
              {CURRENCIES.map((cur) => (
                <TouchableOpacity
                  key={cur.symbol}
                  testID={`currency-${cur.symbol}`}
                  onPress={() => setCurrency(cur.symbol)}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: currency === cur.symbol ? c.income : c.surfaceSecondary,
                      borderColor: currency === cur.symbol ? c.income : c.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: currency === cur.symbol ? '#fff' : c.textPrimary },
                    ]}
                  >
                    {cur.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Budget Split */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.label, { color: c.textMuted }]}>Budget Split</Text>
            {totalPct !== 100 && (
              <Text style={[styles.warning, { color: c.warning }]}>
                Total is {totalPct}% — should be 100%
              </Text>
            )}
            <View style={styles.splitRow}>
              <SplitInput label="Needs" value={pctNeeds} onChange={setPctNeeds} color={c.income} textColor={c.textPrimary} mutedColor={c.textMuted} bgColor={c.surfaceSecondary} borderColor={c.border} />
              <SplitInput label="Wants" value={pctWants} onChange={setPctWants} color={c.warning} textColor={c.textPrimary} mutedColor={c.textMuted} bgColor={c.surfaceSecondary} borderColor={c.border} />
              <SplitInput label="Savings" value={pctSavings} onChange={setPctSavings} color={c.savings} textColor={c.textPrimary} mutedColor={c.textMuted} bgColor={c.surfaceSecondary} borderColor={c.border} />
            </View>
          </View>

          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <SummaryCard label="Needs" amount={needsAmt} currency={currency} color={c.income} c={c} />
            <SummaryCard label="Wants" amount={wantsAmt} currency={currency} color={c.warning} c={c} />
          </View>
          <View style={[styles.summaryFull, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.colorDot, { backgroundColor: c.savings }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Savings</Text>
              <Text style={[styles.summaryAmount, { color: c.savings }]}>
                {currency}{savingsAmt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            testID="save-settings-btn"
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: c.income }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Settings</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SplitInput({ label, value, onChange, color, textColor, mutedColor, bgColor, borderColor }: {
  label: string; value: string; onChange: (v: string) => void; color: string;
  textColor: string; mutedColor: string; bgColor: string; borderColor: string;
}) {
  return (
    <View style={styles.splitItem}>
      <View style={styles.splitLabelRow}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <Text style={[styles.splitLabel, { color: mutedColor }]}>{label}</Text>
      </View>
      <View style={[styles.splitInputWrap, { backgroundColor: bgColor, borderColor }]}>
        <TextInput
          testID={`split-${label.toLowerCase()}-input`}
          style={[styles.splitInput, { color: textColor }]}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={mutedColor}
        />
        <Text style={[styles.pctSign, { color: mutedColor }]}>%</Text>
      </View>
    </View>
  );
}

function SummaryCard({ label, amount, currency, color, c }: {
  label: string; amount: number; currency: string; color: string; c: any;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryLabel, { color: c.textMuted }]}>{label}</Text>
        <Text style={[styles.summaryAmount, { color }]}>
          {currency}{amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 32, lineHeight: 40, marginBottom: 4 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  premiumBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#b8740a', borderRadius: 12, padding: 14, marginBottom: 16,
  },
  premiumBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  premiumBannerCrown: { fontSize: 22 },
  premiumBannerTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' },
  premiumBannerSubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 2 },
  premiumBannerArrow: { fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', marginLeft: 8 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, marginBottom: 12 },
  salaryRow: { flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { fontFamily: 'DMMono_500Medium', fontSize: 28, marginRight: 8 },
  salaryInput: { fontFamily: 'DMMono_500Medium', fontSize: 28, flex: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 0.5 },
  pillText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  warning: { fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 8 },
  splitRow: { flexDirection: 'row', gap: 12 },
  splitItem: { flex: 1 },
  splitLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  splitLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  splitInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, height: 44 },
  splitInput: { fontFamily: 'DMMono_500Medium', fontSize: 18, flex: 1 },
  pctSign: { fontFamily: 'DMMono_400Regular', fontSize: 16 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 12, borderWidth: 0.5, padding: 16, flexDirection: 'row', alignItems: 'center' },
  summaryFull: { borderRadius: 12, borderWidth: 0.5, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  summaryLabel: { fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 2 },
  summaryAmount: { fontFamily: 'DMMono_500Medium', fontSize: 22 },
  saveBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16, color: '#fff' },
});
