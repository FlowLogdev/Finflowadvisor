import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import { useI18n } from '../src/i18n';
import { ThemeToggle } from '../src/components/LogoHeader';
import { getSettings, runScenario, ScenarioResult } from '../src/api';

const RISK_COLORS: Record<string, string> = {
  low: '#2d5a3d',
  medium: '#b8740a',
  high: '#c84b1f',
};

export default function SimulatorScreen() {
  const c = useThemeColors();
  const { t } = useI18n();
  const router = useRouter();

  const [baseSalary, setBaseSalary] = useState('');
  const [currency, setCurrency] = useState('$');
  const [salary, setSalary] = useState('');
  const [billsAdj, setBillsAdj] = useState('0');
  const [savings, setSavings] = useState('0');
  const [bigPurchase, setBigPurchase] = useState('0');
  const [goalName, setGoalName] = useState('Emergency fund');
  const [goalTarget, setGoalTarget] = useState('5000');

  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setBaseSalary(String(s.salary || 0));
        setSalary(String(s.salary || 0));
        setCurrency(s.currency || '$');
      } catch {}
    })();
  }, []);

  const simulate = async () => {
    setLoading(true);
    try {
      const r = await runScenario({
        salary: parseFloat(salary) || 0,
        bills_adjustment: parseFloat(billsAdj) || 0,
        monthly_savings_target: parseFloat(savings) || 0,
        big_purchase_amount: parseFloat(bigPurchase) || 0,
        goal_name: goalName,
        goal_target_amount: parseFloat(goalTarget) || 0,
      });
      setResult(r);
    } catch (e: any) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Auto-simulate on field changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (salary) simulate();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salary, billsAdj, savings, bigPurchase, goalTarget]);

  const riskColor = result ? RISK_COLORS[result.risk_level] || c.textMuted : c.textMuted;

  return (
    <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('dashboard.scenario')}</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            {t('dashboard.scenarioSubtitle')}
          </Text>
        </View>
        <ThemeToggle />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Result card — always visible at top */}
          <View style={[styles.resultCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.resultHeader, { backgroundColor: riskColor + '15' }]}>
              <Ionicons name="sparkles" size={18} color={riskColor} />
              <Text style={[styles.resultLabel, { color: riskColor }]}>
                {result?.risk_level === 'low' ? t('dashboard.riskLow')
                  : result?.risk_level === 'medium' ? t('dashboard.riskMedium')
                  : result?.risk_level === 'high' ? t('dashboard.riskHigh')
                  : '—'}
              </Text>
              {loading && <ActivityIndicator size="small" color={riskColor} />}
            </View>

            <View style={styles.resultRow}>
              <Text style={[styles.resultRowLabel, { color: c.textMuted }]}>Net left / month</Text>
              <Text style={[
                styles.resultValueLarge,
                { color: (result?.net_left ?? 0) >= 0 ? c.income : c.expense },
              ]}>
                {currency}{Math.round(result?.net_left || 0).toLocaleString()}
              </Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={[styles.statLabel, { color: c.textMuted }]}>Bills ratio</Text>
                <Text style={[styles.statValue, { color: c.textPrimary }]}>
                  {result?.bills_ratio_pct?.toFixed(0) || 0}%
                </Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statLabel, { color: c.textMuted }]}>Monthly savings</Text>
                <Text style={[styles.statValue, { color: c.textPrimary }]}>
                  {currency}{Math.round(result?.monthly_savings || 0).toLocaleString()}
                </Text>
              </View>
            </View>

            {result?.goal_timeline_months && result.goal_target > 0 && (
              <View style={[styles.goalRow, { borderTopColor: c.border }]}>
                <Ionicons name="flag-outline" size={18} color={c.income} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.goalTitle, { color: c.textPrimary }]}>
                    {result.goal_name}: {currency}{Math.round(result.goal_target).toLocaleString()}
                  </Text>
                  <Text style={[styles.goalSubtitle, { color: c.textMuted }]}>
                    Reached in <Text style={{ color: c.income, fontFamily: 'DMSans_700Bold' }}>
                      {result.goal_timeline_months} months
                    </Text>
                    {result.goal_timeline_months > 0 && ` (~${(result.goal_timeline_months / 12).toFixed(1)} years)`}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* INPUTS */}
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>INCOME & BILLS</Text>

          <ScenarioField
            c={c}
            label={`Monthly salary (current: ${currency}${parseFloat(baseSalary || '0').toLocaleString()})`}
            prefix={currency}
            value={salary}
            onChange={setSalary}
            placeholder="5000"
          />
          <ScenarioField
            c={c}
            label="Bills adjustment (positive = more, negative = cut)"
            prefix={currency}
            value={billsAdj}
            onChange={setBillsAdj}
            placeholder="0"
            allowNegative
          />

          <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 8 }]}>SAVINGS & GOAL</Text>

          <ScenarioField
            c={c}
            label="Target monthly savings"
            prefix={currency}
            value={savings}
            onChange={setSavings}
            placeholder="500"
          />

          <View style={styles.row2}>
            <View style={{ flex: 2 }}>
              <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>Goal name</Text>
              <TextInput
                value={goalName}
                onChangeText={setGoalName}
                style={[styles.input, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border }]}
                placeholder="Emergency fund"
                placeholderTextColor={c.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>Target</Text>
              <View style={[styles.inputWithPrefix, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.prefix, { color: c.textMuted }]}>{currency}</Text>
                <TextInput
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="numeric"
                  style={[styles.inputInner, { color: c.textPrimary }]}
                  placeholder="5000"
                  placeholderTextColor={c.textMuted}
                />
              </View>
            </View>
          </View>

          <ScenarioField
            c={c}
            label="Big one-time purchase (optional)"
            prefix={currency}
            value={bigPurchase}
            onChange={setBigPurchase}
            placeholder="0"
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScenarioField({ c, label, prefix, value, onChange, placeholder, allowNegative }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>{label}</Text>
      <View style={[styles.inputWithPrefix, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.prefix, { color: c.textMuted }]}>{prefix}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={allowNegative ? 'numbers-and-punctuation' : 'numeric'}
          style={[styles.inputInner, { color: c.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 17 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 1 },

  scroll: { padding: 16 },

  resultCard: {
    borderRadius: 14, borderWidth: 0.5, overflow: 'hidden', marginBottom: 18,
  },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  resultLabel: { fontFamily: 'DMSans_700Bold', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  resultRowLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
  resultValueLarge: { fontFamily: 'DMSans_700Bold', fontSize: 28 },

  statsGrid: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 12, gap: 12 },
  statCell: { flex: 1 },
  statLabel: { fontFamily: 'DMSans_400Regular', fontSize: 11 },
  statValue: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 2 },

  goalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    borderTopWidth: 0.5,
  },
  goalTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
  goalSubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },

  sectionLabel: {
    fontFamily: 'DMSans_500Medium', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  fieldLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 6 },
  inputWithPrefix: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 0.5,
    paddingLeft: 12, paddingRight: 8,
  },
  prefix: { fontFamily: 'DMSans_500Medium', fontSize: 15, marginRight: 6 },
  inputInner: { flex: 1, paddingVertical: 12, fontFamily: 'DMSans_500Medium', fontSize: 15 },
  input: {
    borderRadius: 10, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 12,
    fontFamily: 'DMSans_500Medium', fontSize: 15,
  },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 12 },
});
