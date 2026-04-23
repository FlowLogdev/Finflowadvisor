import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Dimensions, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { useThemeColors } from '../../src/theme';
import { useI18n } from '../../src/i18n';
import {
  getDashboard, createSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  aiAdvisorInsight,
} from '../../src/api';
import { DashboardData, SavingsGoal } from '../../src/types';
import { useAuth } from '../../src/auth';
import { ThemeToggle } from '../../src/components/LogoHeader';
import { MarketsCard, WatchlistCard } from '../../src/components/MarketsCards';
import { InsightsPanel } from '../../src/components/InsightsPanel';
import { ImmuneScoreCard } from '../../src/components/ImmuneScoreCard';

const SCREEN_W = Dimensions.get('window').width;

export default function DashboardScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { t } = useI18n();
  const { logout } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalSaved, setGoalSaved] = useState('0');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    try {
      const d = await getDashboard();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // Fetch AI insight separately (don't block dashboard render on it)
    setAiLoading(true);
    try {
      const res = await aiAdvisorInsight();
      setAiInsight(res.insight);
    } catch (e) {
      // silently fail — insight is an optional enhancement
      setAiInsight(null);
    } finally {
      setAiLoading(false);
    }
  };

  const addGoal = async () => {
    if (!goalName.trim() || !goalTarget.trim()) return;
    const goal = await createSavingsGoal({
      name: goalName.trim(),
      target: parseFloat(goalTarget),
      saved: parseFloat(goalSaved) || 0,
    });
    setData((prev) => prev ? { ...prev, savings_goals: [...prev.savings_goals, goal] } : prev);
    setGoalName('');
    setGoalTarget('');
    setGoalSaved('0');
    setShowGoalForm(false);
  };

  const updateGoalSaved = async (goal: SavingsGoal) => {
    Alert.prompt?.(
      'Update Saved Amount',
      `Current: ${cur}${goal.saved}`,
      async (text: string) => {
        const val = parseFloat(text);
        if (isNaN(val)) return;
        const updated = await updateSavingsGoal(goal.id, { saved: val });
        setData((prev) =>
          prev ? {
            ...prev,
            savings_goals: prev.savings_goals.map((g) => (g.id === goal.id ? updated : g)),
          } : prev
        );
      },
      'plain-text',
      String(goal.saved),
    ) || Alert.alert('Update Saved', 'Tap the amount to edit (iOS only for prompt). Use the form to update.');
  };

  const removeGoal = async (id: string) => {
    await deleteSavingsGoal(id);
    setData((prev) => prev ? { ...prev, savings_goals: prev.savings_goals.filter((g) => g.id !== id) } : prev);
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.income} />
      </SafeAreaView>
    );
  }

  const { settings, total_bills, total_expenses, net_remaining, smart_tip,
    budget_comparison, bills_by_category, expenses_by_category,
    all_spending, cashflow, savings_goals } = data;
  const cur = settings.currency || '$';

  // Pie chart data for expenses
  const expPieData = expenses_by_category.length > 0
    ? expenses_by_category.map((e) => ({
        name: e.name,
        amount: e.amount,
        color: e.color,
        legendFontColor: c.textMuted,
        legendFontSize: 11,
      }))
    : [{ name: 'No data', amount: 1, color: c.surfaceSecondary, legendFontColor: c.textMuted, legendFontSize: 11 }];

  const billPieData = bills_by_category.length > 0
    ? bills_by_category.map((b) => ({
        name: b.name,
        amount: b.amount,
        color: b.color,
        legendFontColor: c.textMuted,
        legendFontSize: 11,
      }))
    : [{ name: 'No data', amount: 1, color: c.surfaceSecondary, legendFontColor: c.textMuted, legendFontSize: 11 }];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.dashHeader}>
            <View>
              <Text style={[styles.title, { color: c.textPrimary }]}>{t('dashboard.title')}</Text>
              <Text style={[styles.subtitle, { color: c.textMuted }]}>{t('dashboard.subtitle')}</Text>
            </View>
            <View style={styles.headerActions}>
              <ThemeToggle />
              <TouchableOpacity testID="nav-history-btn" onPress={() => router.push('/history')} style={styles.headerIcon}>
                <Ionicons name="time-outline" size={22} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity testID="nav-settings-btn" onPress={() => router.push('/settings')} style={styles.headerIcon}>
                <Ionicons name="cog-outline" size={22} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity testID="logout-btn" onPress={async () => { await logout(); router.replace('/landing'); }} style={styles.headerIcon}>
                <Ionicons name="log-out-outline" size={22} color={c.expense} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Metric Cards ── */}
          <View style={styles.metricsRow}>
            <MetricCard label={t('dashboard.salary')} value={`${cur}${settings.salary.toLocaleString()}`} color={c.income} c={c} icon="wallet-outline" />
            <MetricCard label={t('dashboard.bills')} value={`${cur}${total_bills.toLocaleString()}`} color={c.expense} c={c} icon="receipt-outline" />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard label={t('dashboard.expenses')} value={`${cur}${total_expenses.toLocaleString()}`} color={c.warning} c={c} icon="card-outline" />
            <MetricCard label={t('dashboard.netLeft')} value={`${cur}${net_remaining.toLocaleString()}`} color={net_remaining >= 0 ? c.income : c.expense} c={c} icon="trending-up-outline" />
          </View>

          {/* ── Financial Immune Score ── */}
          <ImmuneScoreCard />

          {/* ── Quick Tools Row ── */}
          <View style={styles.quickToolsRow}>
            <TouchableOpacity
              style={[styles.quickTool, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={() => router.push('/future-self' as any)}
              testID="quick-future-self"
            >
              <Text style={styles.quickToolEmoji}>🔮</Text>
              <Text style={[styles.quickToolLabel, { color: c.textPrimary }]}>Future You</Text>
              <Text style={[styles.quickToolHint, { color: c.textMuted }]}>30yr projection</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickTool, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={() => router.push('/subscription-graveyard' as any)}
              testID="quick-graveyard"
            >
              <Text style={styles.quickToolEmoji}>🪦</Text>
              <Text style={[styles.quickToolLabel, { color: c.textPrimary }]}>Graveyard</Text>
              <Text style={[styles.quickToolHint, { color: c.textMuted }]}>Kill unused subs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickTool, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={() => router.push('/simulator' as any)}
              testID="quick-simulator"
            >
              <Text style={styles.quickToolEmoji}>🎲</Text>
              <Text style={[styles.quickToolLabel, { color: c.textPrimary }]}>What-If</Text>
              <Text style={[styles.quickToolHint, { color: c.textMuted }]}>Run scenario</Text>
            </TouchableOpacity>
          </View>

          {/* ── AI Daily Insight (FinBot) ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/advisor')}
            style={[styles.aiCard, { backgroundColor: c.surface, borderColor: c.income }]}
          >
            <View style={[styles.aiIconBubble, { backgroundColor: c.income }]}>
              <Ionicons name="sparkles" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.aiHeader}>
                <Text style={[styles.aiTitle, { color: c.textPrimary }]}>{t('dashboard.finbotTip')}</Text>
                <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
              </View>
              {aiLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <ActivityIndicator size="small" color={c.income} />
                  <Text style={[styles.aiBody, { color: c.textMuted }]}>{t('dashboard.generatingTip')}</Text>
                </View>
              ) : (
                <Text style={[styles.aiBody, { color: c.textPrimary }]}>
                  {aiInsight || t('dashboard.finbotPrompt')}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* ── Smart Insights (Forecast, Personality, Leaks, Weekly) ── */}
          <InsightsPanel />

          {/* ── Live Markets (FX + Stocks) ── */}
          <MarketsCard />
          <WatchlistCard />

          {/* ── Smart Tip ── */}
          <View style={[styles.tipCard, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Ionicons name="bulb-outline" size={20} color={c.warning} />
            <Text style={[styles.tipText, { color: c.textPrimary }]}>{smart_tip}</Text>
          </View>

          {/* ── Budget vs Actual ── */}
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Budget vs Actual</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <BudgetBar label="Needs" target={budget_comparison.needs.target} actual={budget_comparison.needs.actual} color={c.income} cur={cur} c={c} />
            <BudgetBar label="Wants" target={budget_comparison.wants.target} actual={budget_comparison.wants.actual} color={c.warning} cur={cur} c={c} />
            <BudgetBar label="Savings" target={budget_comparison.savings.target} actual={budget_comparison.savings.actual} color={c.savings} cur={cur} c={c} />
          </View>

          {/* ── Expenses by Category ── */}
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Expenses by Category</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, alignItems: 'center' }]}>
            <PieChart
              data={expPieData}
              width={SCREEN_W - 80}
              height={180}
              chartConfig={{
                color: () => c.textPrimary,
                labelColor: () => c.textMuted,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="0"
              absolute
            />
          </View>

          {/* ── Bills by Category ── */}
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Bills by Category</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, alignItems: 'center' }]}>
            <PieChart
              data={billPieData}
              width={SCREEN_W - 80}
              height={180}
              chartConfig={{
                color: () => c.textPrimary,
                labelColor: () => c.textMuted,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="0"
              absolute
            />
          </View>

          {/* ── Spending Breakdown ── */}
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Spending Breakdown</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            {all_spending.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.textMuted }]}>No spending data yet</Text>
            ) : (
              all_spending.slice(0, 10).map((item, idx) => (
                <View key={idx} style={[styles.breakdownRow, idx < Math.min(all_spending.length, 10) - 1 && { borderBottomWidth: 0.5, borderBottomColor: c.border }]}>
                  <Text style={[styles.breakdownRank, { color: c.textMuted }]}>{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.breakdownName, { color: c.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.breakdownCat, { color: c.textMuted }]}>{item.category} · {item.type}</Text>
                  </View>
                  <Text style={[styles.breakdownAmt, { color: c.expense }]}>{cur}{item.amount.toLocaleString()}</Text>
                </View>
              ))
            )}
          </View>

          {/* ── Cashflow Waterfall ── */}
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Cashflow</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <WaterfallBar label="Income" amount={cashflow.income} maxAmount={cashflow.income} color={c.income} cur={cur} c={c} />
            <WaterfallBar label="Bills" amount={-cashflow.bills} maxAmount={cashflow.income} color={c.expense} cur={cur} c={c} />
            <WaterfallBar label="Expenses" amount={-cashflow.expenses} maxAmount={cashflow.income} color={c.warning} cur={cur} c={c} />
            <WaterfallBar label="Net" amount={cashflow.net} maxAmount={cashflow.income} color={cashflow.net >= 0 ? c.income : c.expense} cur={cur} c={c} />
          </View>

          {/* ── Savings Goals ── */}
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Savings Goals</Text>
          {savings_goals.map((goal) => {
            const pct = goal.target > 0 ? Math.min((goal.saved / goal.target) * 100, 100) : 0;
            return (
              <View key={goal.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.goalHeader}>
                  <Text style={[styles.goalName, { color: c.textPrimary }]}>{goal.name}</Text>
                  <TouchableOpacity testID={`delete-goal-${goal.id}`} onPress={() => removeGoal(goal.id)}>
                    <Ionicons name="trash-outline" size={16} color={c.expense} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.goalProgress, { color: c.textMuted }]}>
                  {cur}{goal.saved.toLocaleString()} / {cur}{goal.target.toLocaleString()}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: c.surfaceSecondary }]}>
                  <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: c.savings }]} />
                </View>
                <Text style={[styles.goalPct, { color: c.savings }]}>{pct.toFixed(0)}%</Text>
              </View>
            );
          })}

          <TouchableOpacity
            testID="toggle-add-goal-btn"
            onPress={() => setShowGoalForm(!showGoalForm)}
            style={[styles.addBtn, { backgroundColor: c.savings }]}
          >
            <Ionicons name={showGoalForm ? 'close' : 'add'} size={20} color="#fff" />
            <Text style={styles.addBtnText}>{showGoalForm ? 'Cancel' : 'Add Savings Goal'}</Text>
          </TouchableOpacity>

          {showGoalForm && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <TextInput
                testID="goal-name-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder="Goal name"
                placeholderTextColor={c.textMuted}
                value={goalName}
                onChangeText={setGoalName}
              />
              <TextInput
                testID="goal-target-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder={`Target amount (${cur})`}
                placeholderTextColor={c.textMuted}
                value={goalTarget}
                onChangeText={setGoalTarget}
                keyboardType="numeric"
              />
              <TextInput
                testID="goal-saved-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder={`Already saved (${cur})`}
                placeholderTextColor={c.textMuted}
                value={goalSaved}
                onChangeText={setGoalSaved}
                keyboardType="numeric"
              />
              <TouchableOpacity testID="submit-goal-btn" onPress={addGoal} style={[styles.submitBtn, { backgroundColor: c.savings }]}>
                <Text style={styles.submitBtnText}>Add Goal</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ── Sub-components ── */

function MetricCard({ label, value, color, c, icon }: {
  label: string; value: string; color: string; c: any; icon: string;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={[styles.metricLabel, { color: c.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function BudgetBar({ label, target, actual, color, cur, c }: {
  label: string; target: number; actual: number; color: string; cur: string; c: any;
}) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 150) : 0;
  const over = actual > target;
  return (
    <View style={styles.budgetItem}>
      <View style={styles.budgetLabelRow}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <Text style={[styles.budgetLabel, { color: c.textPrimary }]}>{label}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.budgetAmounts, { color: c.textMuted }]}>
          {cur}{actual.toLocaleString()} / {cur}{target.toLocaleString()}
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: c.surfaceSecondary }]}>
        <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: over ? c.expense : color }]} />
      </View>
    </View>
  );
}

function WaterfallBar({ label, amount, maxAmount, color, cur, c }: {
  label: string; amount: number; maxAmount: number; color: string; cur: string; c: any;
}) {
  const abs = Math.abs(amount);
  const pct = maxAmount > 0 ? (abs / maxAmount) * 100 : 0;
  const sign = amount < 0 ? '-' : '';
  return (
    <View style={styles.waterfallItem}>
      <View style={styles.waterfallLabelRow}>
        <Text style={[styles.waterfallLabel, { color: c.textPrimary }]}>{label}</Text>
        <Text style={[styles.waterfallAmount, { color }]}>{sign}{cur}{abs.toLocaleString()}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: c.surfaceSecondary }]}>
        <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 32, lineHeight: 40, marginBottom: 4 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  dashHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  headerIcon: { padding: 8, borderRadius: 10 },
  sectionTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 18, marginBottom: 12, marginTop: 8 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 16 },

  // Metrics
  metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  // Quick tools row
  quickToolsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickTool: {
    flex: 1, borderRadius: 12, borderWidth: 0.5,
    paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center',
  },
  quickToolEmoji: { fontSize: 24, marginBottom: 6 },
  quickToolLabel: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  quickToolHint: { fontFamily: 'DMSans_400Regular', fontSize: 10, marginTop: 2, textAlign: 'center' },
  metricCard: { flex: 1, borderRadius: 12, borderWidth: 0.5, padding: 16 },
  metricLabel: { fontFamily: 'DMSans_400Regular', fontSize: 13, marginLeft: 6 },
  metricValue: { fontFamily: 'DMMono_500Medium', fontSize: 20 },

  // Tip
  tipCard: { borderRadius: 12, borderWidth: 0.5, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 24 },
  tipText: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, flex: 1 },

  // AI Insight card
  aiCard: {
    borderRadius: 12, borderWidth: 1, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12,
  },
  aiIconBubble: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  aiBody: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, marginTop: 4 },

  // Budget bars
  budgetItem: { marginBottom: 14 },
  budgetLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  budgetLabel: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  budgetAmounts: { fontFamily: 'DMMono_400Regular', fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  // Breakdown
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  breakdownRank: { fontFamily: 'DMMono_400Regular', fontSize: 13, width: 24 },
  breakdownName: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  breakdownCat: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 2 },
  breakdownAmt: { fontFamily: 'DMMono_500Medium', fontSize: 14 },

  // Waterfall
  waterfallItem: { marginBottom: 14 },
  waterfallLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  waterfallLabel: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  waterfallAmount: { fontFamily: 'DMMono_500Medium', fontSize: 14 },

  // Savings goals
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  goalName: { fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
  goalProgress: { fontFamily: 'DMMono_400Regular', fontSize: 13, marginBottom: 8 },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: 10, borderRadius: 5 },
  goalPct: { fontFamily: 'DMMono_500Medium', fontSize: 13, textAlign: 'right' },

  // Form
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginBottom: 16, gap: 8 },
  addBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },
  input: { borderRadius: 12, borderWidth: 0.5, padding: 14, fontSize: 16, fontFamily: 'DMSans_400Regular', marginBottom: 12 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
});
