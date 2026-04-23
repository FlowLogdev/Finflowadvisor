import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import { ThemeToggle } from '../src/components/LogoHeader';
import {
  getSettings, runScenario, ScenarioResult,
  getFutureSelf, FutureSelfResponse,
} from '../src/api';

const SCREEN_W = Dimensions.get('window').width;
const RISK_COLORS: Record<string, string> = {
  low: '#43a047',
  medium: '#b8740a',
  high: '#c84b1f',
};

type Tab = 'future' | 'scenario';

export default function SimulatorScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('future');

  // Future Self state
  const [futureSelf, setFutureSelf] = useState<FutureSelfResponse | null>(null);
  const [futureLoading, setFutureLoading] = useState(true);

  // Scenario state
  const [baseSalary, setBaseSalary] = useState('');
  const [currency, setCurrency] = useState('$');
  const [salary, setSalary] = useState('');
  const [billsAdj, setBillsAdj] = useState('0');
  const [savings, setSavings] = useState('0');
  const [bigPurchase, setBigPurchase] = useState('0');
  const [goalName, setGoalName] = useState('Emergency fund');
  const [goalTarget, setGoalTarget] = useState('5000');
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  useEffect(() => {
    loadFutureSelf();
    loadSettings();
  }, []);

  const loadFutureSelf = async () => {
    setFutureLoading(true);
    try {
      const res = await getFutureSelf();
      setFutureSelf(res);
    } catch (e) {
      console.error(e);
    } finally {
      setFutureLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const s = await getSettings();
      setBaseSalary(String(s.salary || 0));
      setSalary(String(s.salary || 0));
      setCurrency(s.currency || '$');
    } catch {}
  };

  const simulate = async () => {
    setScenarioLoading(true);
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
    } catch {}
    finally { setScenarioLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { if (salary) simulate(); }, 400);
    return () => clearTimeout(timer);
  }, [salary, billsAdj, savings, bigPurchase, goalTarget]);

  const cur = futureSelf?.currency || currency;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Financial Simulator</Text>
          <Text style={[styles.headerSub, { color: c.textMuted }]}>See your future, change it</Text>
        </View>
        <ThemeToggle />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TabButton label="🔭 Future Self" active={activeTab === 'future'} c={c} onPress={() => setActiveTab('future')} />
        <TabButton label="🧮 Scenario" active={activeTab === 'scenario'} c={c} onPress={() => setActiveTab('scenario')} />
      </View>

      {activeTab === 'future' ? (
        <FutureSelfView data={futureSelf} loading={futureLoading} c={c} router={router} onRefresh={loadFutureSelf} />
      ) : (
        <ScenarioView
          c={c} currency={currency} baseSalary={baseSalary}
          salary={salary} setSalary={setSalary}
          billsAdj={billsAdj} setBillsAdj={setBillsAdj}
          savings={savings} setSavings={setSavings}
          bigPurchase={bigPurchase} setBigPurchase={setBigPurchase}
          goalName={goalName} setGoalName={setGoalName}
          goalTarget={goalTarget} setGoalTarget={setGoalTarget}
          result={result} loading={scenarioLoading}
        />
      )}
    </SafeAreaView>
  );
}

/* ── Future Self View ── */

function FutureSelfView({ data, loading, c, router, onRefresh }: {
  data: FutureSelfResponse | null; loading: boolean; c: any; router: any; onRefresh: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.savings} />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>Projecting your future…</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          Add your salary and expenses to see your Future Self projections.
        </Text>
        <TouchableOpacity onPress={onRefresh} style={[styles.refreshBtn, { backgroundColor: c.savings }]}>
          <Text style={styles.refreshBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cur = data.currency;
  const maxBalance = Math.max(
    ...data.optimized.projections.map((p) => p.balance),
    1
  );

  const horizonLabels: Record<number, string> = { 5: '5 Years', 10: '10 Years', 20: '20 Years', 30: '30 Years' };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* Hero: Monthly savings comparison */}
      <View style={[styles.heroCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.heroTitle, { color: c.textPrimary }]}>Your Two Paths</Text>
        <Text style={[styles.heroSub, { color: c.textMuted }]}>
          Based on your current spending vs. optimized habits
        </Text>
        <View style={styles.pathRow}>
          <PathBox
            label="Current You"
            emoji="👤"
            monthlySavings={data.current.monthly_savings}
            monthlySpend={data.current.monthly_spend}
            cur={cur}
            color={c.warning}
            c={c}
          />
          <View style={[styles.pathDivider, { backgroundColor: c.border }]} />
          <PathBox
            label="Optimized You"
            emoji="🚀"
            monthlySavings={data.optimized.monthly_savings}
            monthlySpend={data.optimized.monthly_spend}
            cur={cur}
            color={c.income}
            c={c}
            freedAmount={data.optimized.monthly_freed}
          />
        </View>
        {data.optimized.monthly_freed > 0 && (
          <View style={[styles.freedBanner, { backgroundColor: c.income + '18' }]}>
            <Text style={[styles.freedText, { color: c.income }]}>
              ✦ Free up {cur}{data.optimized.monthly_freed.toLocaleString()}/mo by cutting unused subscriptions
            </Text>
          </View>
        )}
      </View>

      {/* Timeline comparison */}
      <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Wealth Timeline</Text>
      <Text style={[styles.sectionSub, { color: c.textMuted }]}>
        Compounding at {data.assumptions.annual_return_pct}% annual return
      </Text>

      {data.current.projections.map((curr, idx) => {
        const opt = data.optimized.projections[idx];
        const currPct = (curr.balance / maxBalance) * 100;
        const optPct = (opt.balance / maxBalance) * 100;
        const diff = opt.balance - curr.balance;

        return (
          <View key={curr.years} style={[styles.horizonCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.horizonLabel, { color: c.textMuted }]}>{horizonLabels[curr.years]}</Text>

            {/* Current You bar */}
            <View style={styles.timelineRow}>
              <Text style={[styles.timelineWho, { color: c.warning }]}>👤</Text>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <View style={[styles.barTrack, { backgroundColor: c.surfaceSecondary }]}>
                  <View style={[styles.barFill, { width: `${currPct}%`, backgroundColor: c.warning }]} />
                </View>
              </View>
              <Text style={[styles.timelineAmount, { color: c.warning }]}>
                {cur}{abbreviate(curr.balance)}
              </Text>
            </View>

            {/* Optimized You bar */}
            <View style={[styles.timelineRow, { marginTop: 8 }]}>
              <Text style={[styles.timelineWho, { color: c.income }]}>🚀</Text>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <View style={[styles.barTrack, { backgroundColor: c.surfaceSecondary }]}>
                  <View style={[styles.barFill, { width: `${optPct}%`, backgroundColor: c.income }]} />
                </View>
              </View>
              <Text style={[styles.timelineAmount, { color: c.income }]}>
                {cur}{abbreviate(opt.balance)}
              </Text>
            </View>

            {diff > 0 && (
              <View style={[styles.diffBadge, { backgroundColor: c.savings + '20' }]}>
                <Text style={[styles.diffText, { color: c.savings }]}>
                  +{cur}{abbreviate(diff)} more with optimized habits
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Assumptions */}
      <View style={[styles.assumptionsCard, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
        <Text style={[styles.assumptionsTitle, { color: c.textMuted }]}>Assumptions</Text>
        <Text style={[styles.assumptionsText, { color: c.textMuted }]}>
          • {data.assumptions.annual_return_pct}% annual investment return (S&P 500 historical avg){'\n'}
          • Starting balance: {cur}{data.assumptions.starting_balance.toLocaleString()}{'\n'}
          • Optimization: {data.assumptions.optimization_source === 'subscription_cleanup'
            ? 'cancel unused subscriptions'
            : '10% reduction in discretionary spending'}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.push('/graveyard')}
        style={[styles.graveyardBtn, { backgroundColor: c.surface, borderColor: c.border }]}
      >
        <Text style={{ fontSize: 20 }}>⚰️</Text>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.graveyardBtnTitle, { color: c.textPrimary }]}>Open Subscription Graveyard</Text>
          <Text style={[styles.graveyardBtnSub, { color: c.textMuted }]}>Find and cut subscriptions you forgot</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ── Scenario View (existing functionality) ── */

function ScenarioView({
  c, currency, baseSalary, salary, setSalary, billsAdj, setBillsAdj,
  savings, setSavings, bigPurchase, setBigPurchase, goalName, setGoalName,
  goalTarget, setGoalTarget, result, loading,
}: any) {
  const riskColor = result ? RISK_COLORS[result.risk_level] || c.textMuted : c.textMuted;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.resultCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.resultHeader, { backgroundColor: riskColor + '15' }]}>
            <Ionicons name="sparkles" size={18} color={riskColor} />
            <Text style={[styles.resultLabel, { color: riskColor }]}>
              {result?.risk_level === 'low' ? 'Low Risk — Well balanced'
                : result?.risk_level === 'medium' ? 'Medium Risk — Watch spending'
                : result?.risk_level === 'high' ? 'High Risk — Needs attention'
                : '—'}
            </Text>
            {loading && <ActivityIndicator size="small" color={riskColor} />}
          </View>
          <View style={styles.resultRow}>
            <Text style={[styles.resultRowLabel, { color: c.textMuted }]}>Net left / month</Text>
            <Text style={[styles.resultValueLarge, { color: (result?.net_left ?? 0) >= 0 ? c.income : c.expense }]}>
              {currency}{Math.round(result?.net_left || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Bills ratio</Text>
              <Text style={[styles.statValue, { color: c.textPrimary }]}>{result?.bills_ratio_pct?.toFixed(0) || 0}%</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statLabel, { color: c.textMuted }]}>Monthly savings</Text>
              <Text style={[styles.statValue, { color: c.textPrimary }]}>{currency}{Math.round(result?.monthly_savings || 0).toLocaleString()}</Text>
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

        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>INCOME & BILLS</Text>
        <ScenarioField c={c} label={`Monthly salary (current: ${currency}${parseFloat(baseSalary || '0').toLocaleString()})`} prefix={currency} value={salary} onChange={setSalary} placeholder="5000" />
        <ScenarioField c={c} label="Bills adjustment (positive = more, negative = cut)" prefix={currency} value={billsAdj} onChange={setBillsAdj} placeholder="0" allowNegative />

        <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 8 }]}>SAVINGS & GOAL</Text>
        <ScenarioField c={c} label="Target monthly savings" prefix={currency} value={savings} onChange={setSavings} placeholder="500" />
        <View style={styles.row2}>
          <View style={{ flex: 2 }}>
            <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>Goal name</Text>
            <TextInput value={goalName} onChangeText={setGoalName} style={[styles.input, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border }]} placeholder="Emergency fund" placeholderTextColor={c.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>Target</Text>
            <View style={[styles.inputWithPrefix, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.prefix, { color: c.textMuted }]}>{currency}</Text>
              <TextInput value={goalTarget} onChangeText={setGoalTarget} keyboardType="numeric" style={[styles.inputInner, { color: c.textPrimary }]} placeholder="5000" placeholderTextColor={c.textMuted} />
            </View>
          </View>
        </View>
        <ScenarioField c={c} label="Big one-time purchase (optional)" prefix={currency} value={bigPurchase} onChange={setBigPurchase} placeholder="0" />
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Sub-components ── */

function TabButton({ label, active, c, onPress }: { label: string; active: boolean; c: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && { borderBottomColor: c.savings, borderBottomWidth: 2 }]}>
      <Text style={[styles.tabLabel, { color: active ? c.savings : c.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PathBox({ label, emoji, monthlySavings, monthlySpend, cur, color, c, freedAmount }: any) {
  return (
    <View style={styles.pathBox}>
      <Text style={styles.pathEmoji}>{emoji}</Text>
      <Text style={[styles.pathLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.pathSavings, { color }]}>{cur}{monthlySavings.toLocaleString()}/mo</Text>
      <Text style={[styles.pathSavingsLabel, { color: c.textMuted }]}>saved monthly</Text>
      <Text style={[styles.pathSpend, { color: c.textMuted }]}>{cur}{monthlySpend.toLocaleString()} spend</Text>
    </View>
  );
}

function ScenarioField({ c, label, prefix, value, onChange, placeholder, allowNegative }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>{label}</Text>
      <View style={[styles.inputWithPrefix, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.prefix, { color: c.textMuted }]}>{prefix}</Text>
        <TextInput value={value} onChangeText={onChange} keyboardType={allowNegative ? 'numbers-and-punctuation' : 'numeric'} style={[styles.inputInner, { color: c.textPrimary }]} placeholder={placeholder} placeholderTextColor={c.textMuted} />
      </View>
    </View>
  );
}

function abbreviate(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 12 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  refreshBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  refreshBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  headerTitle: { fontFamily: 'DMSans_700Bold', fontSize: 17 },
  headerSub: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 1 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 0.5 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },

  scroll: { padding: 16 },
  sectionTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 18, marginBottom: 4, marginTop: 8 },
  sectionSub: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 12 },
  sectionLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  // Hero card
  heroCard: { borderRadius: 16, borderWidth: 0.5, padding: 16, marginBottom: 20 },
  heroTitle: { fontFamily: 'DMSans_700Bold', fontSize: 20, marginBottom: 4 },
  heroSub: { fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 16 },
  pathRow: { flexDirection: 'row', alignItems: 'center' },
  pathDivider: { width: 1, height: 80, marginHorizontal: 8 },
  pathBox: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  pathEmoji: { fontSize: 28, marginBottom: 4 },
  pathLabel: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginBottom: 6 },
  pathSavings: { fontFamily: 'DMMono_500Medium', fontSize: 18 },
  pathSavingsLabel: { fontFamily: 'DMSans_400Regular', fontSize: 10, marginBottom: 4 },
  pathSpend: { fontFamily: 'DMMono_400Regular', fontSize: 11 },
  freedBanner: { borderRadius: 10, padding: 10, marginTop: 12 },
  freedText: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, textAlign: 'center' },

  // Horizon cards
  horizonCard: { borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 12 },
  horizonLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'center' },
  timelineWho: { fontSize: 18, width: 28 },
  timelineAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14, width: 64, textAlign: 'right' },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  diffBadge: { borderRadius: 8, padding: 8, marginTop: 10 },
  diffText: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, textAlign: 'center' },

  // Assumptions
  assumptionsCard: { borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  assumptionsTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  assumptionsText: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },

  // Graveyard button
  graveyardBtn: { borderRadius: 14, borderWidth: 0.5, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  graveyardBtnTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  graveyardBtnSub: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },

  // Scenario
  resultCard: { borderRadius: 14, borderWidth: 0.5, overflow: 'hidden', marginBottom: 18 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  resultLabel: { fontFamily: 'DMSans_700Bold', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  resultRowLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
  resultValueLarge: { fontFamily: 'DMSans_700Bold', fontSize: 28 },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 12, gap: 12 },
  statCell: { flex: 1 },
  statLabel: { fontFamily: 'DMSans_400Regular', fontSize: 11 },
  statValue: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 2 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: 0.5 },
  goalTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
  goalSubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },

  fieldLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 6 },
  inputWithPrefix: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 0.5, paddingLeft: 12, paddingRight: 8 },
  prefix: { fontFamily: 'DMSans_500Medium', fontSize: 15, marginRight: 6 },
  inputInner: { flex: 1, paddingVertical: 12, fontFamily: 'DMSans_500Medium', fontSize: 15 },
  input: { borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 12, fontFamily: 'DMSans_500Medium', fontSize: 15 },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 12 },
});
