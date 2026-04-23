import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useThemeColors, useIsDark } from '../src/theme';
import { getFutureSelf, FutureSelfResponse } from '../src/api';

const fmt = (n: number, sym: string) => {
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(0)}k`;
  return `${sym}${Math.round(n).toLocaleString()}`;
};
const fmtFull = (n: number, sym: string) =>
  `${sym}${Math.round(n).toLocaleString('en-US')}`;

export default function FutureSelfScreen() {
  const c = useThemeColors();
  const isDark = useIsDark();
  const router = useRouter();
  const [data, setData] = useState<FutureSelfResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await getFutureSelf();
        setData(d);
      } catch (e: any) {
        Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not load projection');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const screenW = Dimensions.get('window').width;
  const chartWidth = Math.min(screenW - 48, 600);

  const chartData = useMemo(() => {
    if (!data) return null;
    const labels = data.current.projections.map((p) => p.label);
    return {
      labels,
      datasets: [
        { data: data.current.projections.map((p) => p.balance), color: () => c.textMuted, strokeWidth: 2 },
        { data: data.optimized.projections.map((p) => p.balance), color: () => c.income, strokeWidth: 3 },
      ],
      legend: ['Current path', 'Optimized path'],
    };
  }, [data, c]);

  const sym = data?.currency || '$';
  const same = data && data.current.monthly_savings === data.optimized.monthly_savings;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Future You 🔮</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            See where your habits lead
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={c.income} />
          </View>
        ) : !data ? (
          <Text style={[styles.muted, { color: c.textMuted, textAlign: 'center', padding: 40 }]}>
            Pull to retry
          </Text>
        ) : (
          <>
            {/* Hero — optimized 30yr balance */}
            <View style={[styles.heroCard, { backgroundColor: c.income, borderColor: c.income }]}>
              <Text style={styles.heroLabel}>Potential nest egg in 30 years</Text>
              <Text style={styles.heroValue}>
                {fmtFull(data.optimized.projections[data.optimized.projections.length - 1].balance, sym)}
              </Text>
              <Text style={styles.heroSub}>
                saving {sym}{data.optimized.monthly_savings.toLocaleString()}/mo at {data.assumptions.annual_return_pct}% annual return
              </Text>
            </View>

            {/* Chart */}
            {chartData && (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Projected wealth over time</Text>
                <LineChart
                  data={chartData}
                  width={chartWidth}
                  height={220}
                  yAxisLabel=""
                  yAxisSuffix=""
                  chartConfig={{
                    backgroundColor: c.surface,
                    backgroundGradientFrom: c.surface,
                    backgroundGradientTo: c.surface,
                    decimalPlaces: 0,
                    color: (opacity = 1) => isDark ? `rgba(255,255,255,${opacity})` : `rgba(26,26,24,${opacity})`,
                    labelColor: () => c.textMuted,
                    propsForDots: { r: '4' },
                    propsForBackgroundLines: { stroke: c.border },
                  }}
                  bezier
                  withShadow={false}
                  withInnerLines={false}
                  formatYLabel={(y) => {
                    const n = parseFloat(y);
                    if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
                    if (n >= 1_000) return `${sym}${Math.round(n / 1000)}k`;
                    return `${sym}${Math.round(n)}`;
                  }}
                  style={{ marginLeft: -10, marginTop: 10 }}
                />
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: c.textMuted }]} />
                    <Text style={[styles.legendText, { color: c.textPrimary }]}>Current</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: c.income }]} />
                    <Text style={[styles.legendText, { color: c.textPrimary }]}>Optimized</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Both paths side-by-side */}
            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>
              Compare your paths
            </Text>
            <View style={styles.pathsRow}>
              <PathCard
                c={c}
                label="Current path"
                emoji="🚶"
                color={c.textMuted}
                monthly={data.current.monthly_savings}
                final={data.current.projections[data.current.projections.length - 1].balance}
                sym={sym}
              />
              <PathCard
                c={c}
                label="Optimized path"
                emoji="🚀"
                color={c.income}
                monthly={data.optimized.monthly_savings}
                final={data.optimized.projections[data.optimized.projections.length - 1].balance}
                freed={data.optimized.monthly_freed}
                sym={sym}
              />
            </View>

            {/* Horizon breakdown */}
            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>
              Over different horizons
            </Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.horizonHeaderRow}>
                <Text style={[styles.horizonHeaderCell, { color: c.textMuted, flex: 1 }]}>Horizon</Text>
                <Text style={[styles.horizonHeaderCell, { color: c.textMuted, width: 100, textAlign: 'right' }]}>Current</Text>
                <Text style={[styles.horizonHeaderCell, { color: c.income, width: 100, textAlign: 'right' }]}>Optimized</Text>
              </View>
              {data.current.projections.map((cp, idx) => {
                const op = data.optimized.projections[idx];
                const diff = op.balance - cp.balance;
                return (
                  <View
                    key={cp.years}
                    style={[
                      styles.horizonRow,
                      idx < data.current.projections.length - 1 && { borderBottomColor: c.border, borderBottomWidth: 0.5 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.horizonLabel, { color: c.textPrimary }]}>{cp.years} years</Text>
                      {diff > 0 && (
                        <Text style={[styles.horizonDiff, { color: c.income }]}>
                          +{fmt(diff, sym)} more
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.horizonValue, { color: c.textMuted, width: 100, textAlign: 'right' }]}>
                      {fmt(cp.balance, sym)}
                    </Text>
                    <Text style={[styles.horizonValue, { color: c.income, width: 100, textAlign: 'right' }]}>
                      {fmt(op.balance, sym)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Optimization callout */}
            {!same && data.optimized.monthly_freed ? (
              <View style={[styles.callout, { backgroundColor: c.income + '18', borderColor: c.income }]}>
                <Ionicons name="bulb" size={18} color={c.income} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.calloutTitle, { color: c.income }]}>
                    How to reach the optimized path
                  </Text>
                  <Text style={[styles.calloutText, { color: c.textPrimary }]}>
                    Free up just <Text style={{ fontFamily: 'DMSans_700Bold' }}>{sym}{data.optimized.monthly_freed.toLocaleString()}/mo</Text>
                    {' '}
                    {data.assumptions.optimization_source === 'subscription_cleanup'
                      ? 'by cancelling the subscriptions you\'ve marked as unused'
                      : 'by trimming ~10% off your discretionary spending'}
                    .
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Assumptions */}
            <View style={[styles.assumptionsBox, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <Text style={[styles.assumptionsTitle, { color: c.textPrimary }]}>Assumptions</Text>
              <Text style={[styles.assumptionsText, { color: c.textMuted }]}>
                • Starting balance: {sym}{data.assumptions.starting_balance.toLocaleString()} (from your savings goals){'\n'}
                • Expected annual return: {data.assumptions.annual_return_pct}% (broad-market average){'\n'}
                • Contributions compounded monthly{'\n'}
                • Figures are illustrative — real returns vary and inflation will erode buying power
              </Text>
            </View>

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PathCard({ c, label, emoji, color, monthly, final, freed, sym }: any) {
  return (
    <View style={[styles.pathCard, { backgroundColor: c.surface, borderColor: color }]}>
      <Text style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</Text>
      <Text style={[styles.pathLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.pathMonthly, { color }]}>
        {sym}{monthly.toLocaleString()}<Text style={{ fontSize: 12, color: c.textMuted }}>/mo</Text>
      </Text>
      {freed != null && freed > 0 ? (
        <Text style={[styles.pathExtra, { color: c.income }]}>
          +{sym}{freed.toLocaleString()} freed
        </Text>
      ) : null}
      <View style={[styles.pathDivider, { backgroundColor: c.border }]} />
      <Text style={[styles.pathFinalLabel, { color: c.textMuted }]}>In 30 years</Text>
      <Text style={[styles.pathFinal, { color }]}>{fmt(final, sym)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 60 },
  muted: { fontFamily: 'DMSans_400Regular', fontSize: 13 },

  sectionLabel: {
    fontFamily: 'DMSans_500Medium', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },

  // Hero
  heroCard: {
    borderRadius: 14, borderWidth: 0.5, padding: 18, marginBottom: 16, alignItems: 'center',
  },
  heroLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: 1 },
  heroValue: { fontFamily: 'DMSans_700Bold', fontSize: 34, color: '#fff', marginTop: 6 },
  heroSub: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 6, textAlign: 'center' },

  card: { borderRadius: 12, borderWidth: 0.5, padding: 16 },

  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: 'DMSans_500Medium', fontSize: 12 },

  pathsRow: { flexDirection: 'row', gap: 10 },
  pathCard: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 14, alignItems: 'flex-start',
  },
  pathLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  pathMonthly: { fontFamily: 'DMSans_700Bold', fontSize: 20, marginTop: 4 },
  pathExtra: { fontFamily: 'DMSans_600SemiBold', fontSize: 11, marginTop: 2 },
  pathDivider: { height: 1, width: '100%', marginVertical: 10 },
  pathFinalLabel: { fontFamily: 'DMSans_500Medium', fontSize: 10, textTransform: 'uppercase' },
  pathFinal: { fontFamily: 'DMSans_700Bold', fontSize: 22, marginTop: 2 },

  horizonHeaderRow: { flexDirection: 'row', paddingBottom: 10, borderBottomColor: 'rgba(128,128,128,0.15)', borderBottomWidth: 1 },
  horizonHeaderCell: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  horizonRow: { flexDirection: 'row', paddingVertical: 10, alignItems: 'center' },
  horizonLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  horizonValue: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  horizonDiff: { fontFamily: 'DMSans_500Medium', fontSize: 11, marginTop: 2 },

  callout: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 10, borderWidth: 0.5, padding: 12, marginTop: 16,
  },
  calloutTitle: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  calloutText: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },

  assumptionsBox: {
    borderRadius: 10, borderWidth: 0.5, padding: 12, marginTop: 16,
  },
  assumptionsTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, marginBottom: 6 },
  assumptionsText: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
});
