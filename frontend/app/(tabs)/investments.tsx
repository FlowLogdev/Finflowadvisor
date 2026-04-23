import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  RefreshControl, Linking, Platform, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';

import { useThemeColors, useIsDark } from '../../src/theme';
import { useAuth } from '../../src/auth';
import {
  getInvestmentRates, getInstitutions, projectInvestment, getInvestmentAdvice,
  InvestmentRates, Institution, ProjectResponse, AdviceResponse,
} from '../../src/investmentsApi';
import { getSettings } from '../../src/api';
import { getBillingMe } from '../../src/featuresApi';

type Country = 'br' | 'us';
type Period = 6 | 12 | 24 | 60 | 120;

const PERIOD_CHOICES: { months: Period; label: string }[] = [
  { months: 6,   label: '6m'  },
  { months: 12,  label: '1y'  },
  { months: 24,  label: '2y'  },
  { months: 60,  label: '5y'  },
  { months: 120, label: '10y' },
];

const fmtMoney = (n: number, sym: string) => {
  const s = Math.abs(n) >= 1000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n.toFixed(2);
  return `${sym}${s}`;
};

export default function InvestmentsScreen() {
  const c = useThemeColors();
  const isDark = useIsDark();
  const router = useRouter();
  const { user } = useAuth();

  const [country, setCountry] = useState<Country>('br');
  const [rates, setRates] = useState<InvestmentRates | null>(null);
  const [instResp, setInstResp] = useState<{ br?: Institution[]; us?: Institution[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState('$');
  const [isPremium, setIsPremium] = useState(false);

  // Calculator state
  const [initial, setInitial] = useState('1000');
  const [monthly, setMonthly] = useState('200');
  const [period, setPeriod] = useState<Period>(60);
  const [projection, setProjection] = useState<ProjectResponse | null>(null);
  const [projLoading, setProjLoading] = useState(false);

  // AI advice state
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  const sym = useMemo(() => (country === 'br' ? 'R$' : '$'), [country]);

  // Load all initial data
  const loadAll = useCallback(async () => {
    try {
      const [r, ibr, ius, s] = await Promise.all([
        getInvestmentRates().catch(() => null),
        getInstitutions('br').catch(() => null),
        getInstitutions('us').catch(() => null),
        getSettings().catch(() => null),
      ]);
      if (r) setRates(r);
      setInstResp({ br: ibr?.institutions, us: ius?.institutions });
      if (s?.currency) setCurrency(s.currency);

      // Premium check (non-blocking — we gate rich features)
      const me = await getBillingMe().catch(() => ({ premium: false }));
      setIsPremium(!!me.premium);
    } catch (_e) {
      // Silent fail — individual sections will show retry
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-run projection whenever inputs change (debounced via period/initial/monthly)
  useEffect(() => {
    const runProjection = async () => {
      const i = parseFloat(initial) || 0;
      const m = parseFloat(monthly) || 0;
      if (i <= 0 && m <= 0) { setProjection(null); return; }
      setProjLoading(true);
      try {
        const p = await projectInvestment(i, m, period);
        setProjection(p);
      } catch (_e) {
        setProjection(null);
      } finally {
        setProjLoading(false);
      }
    };
    const timer = setTimeout(runProjection, 500);
    return () => clearTimeout(timer);
  }, [initial, monthly, period]);

  const fetchAdvice = async () => {
    setAdviceLoading(true);
    try {
      const a = await getInvestmentAdvice({ country });
      setAdvice(a);
    } catch (e: any) {
      Alert.alert('Advice error', e?.message?.slice(0, 160) || 'Could not load advice');
    } finally {
      setAdviceLoading(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const openUrl = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch (_e) {/* noop */}
  };

  // ── Render ─────────────────────────────────────────────
  const br = rates?.br || { selic_annual_pct: null, cdi_annual_pct: null, poupanca_annual_pct: null };
  const us = rates?.us || { fed_funds_pct: null, treasury_1y_pct: null, treasury_5y_pct: null, treasury_10y_pct: null, hysa_avg_pct: null };
  const isBr = country === 'br';
  const institutions = isBr ? instResp.br : instResp.us;

  const screenW = Dimensions.get('window').width;
  const chartWidth = Math.min(screenW - 48, 600);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Investments</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            Live rates · Projections · AI advice
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings' as any)} hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color={c.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Country tabs */}
      <View style={[styles.countryRow, { backgroundColor: c.surfaceSecondary }]}>
        {(['br', 'us'] as Country[]).map((key) => (
          <TouchableOpacity
            key={key}
            testID={`invest-country-${key}`}
            style={[
              styles.countryPill,
              country === key && { backgroundColor: c.income },
            ]}
            onPress={() => setCountry(key)}
          >
            <Text style={styles.countryEmoji}>{key === 'br' ? '🇧🇷' : '🇺🇸'}</Text>
            <Text style={[
              styles.countryText,
              { color: country === key ? '#fff' : c.textPrimary },
            ]}>
              {key === 'br' ? 'Brazil' : 'USA'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.income} />}
      >
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={c.income} />
            <Text style={[styles.muted, { color: c.textMuted, marginTop: 10 }]}>
              Loading rates…
            </Text>
          </View>
        ) : (
          <>
            {/* Live Rates Grid */}
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
              {isBr ? 'Brazil Benchmarks' : 'USA Benchmarks'}
              {rates && (rates.br.fallback || rates.us.fallback) && !isPremium ? ' · Cached' : ''}
            </Text>
            <View style={styles.rateGrid}>
              {isBr ? (
                <>
                  <RateCard c={c} label="Selic (meta)"   value={br.selic_annual_pct}   suffix="% /yr" tone="income" />
                  <RateCard c={c} label="CDI"            value={br.cdi_annual_pct}     suffix="% /yr" tone="savings" />
                  <RateCard c={c} label="Poupança"       value={br.poupanca_annual_pct} suffix="% /yr" tone="warning" />
                </>
              ) : (
                <>
                  <RateCard c={c} label="Fed Funds"      value={us.fed_funds_pct}      suffix="% /yr" tone="income" />
                  <RateCard c={c} label="HYSA Avg"       value={us.hysa_avg_pct}       suffix="% APY" tone="savings" />
                  <RateCard c={c} label="10Y Treasury"   value={us.treasury_10y_pct}   suffix="% /yr" tone="warning" />
                </>
              )}
            </View>
            {!isBr && (
              <View style={[styles.treasuryRow, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.treasuryLabel, { color: c.textMuted }]}>Treasury yields</Text>
                <View style={styles.treasuryPills}>
                  <TreasuryPill c={c} label="1Y" value={us.treasury_1y_pct} />
                  <TreasuryPill c={c} label="5Y" value={us.treasury_5y_pct} />
                  <TreasuryPill c={c} label="10Y" value={us.treasury_10y_pct} />
                </View>
              </View>
            )}

            {/* ── AI Advice ── */}
            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>AI Suggestion</Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              {advice ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="sparkles" size={18} color={c.income} />
                    <Text style={[styles.adviceBucket, { color: c.income }]}>{advice.bucket}</Text>
                  </View>
                  <Text style={[styles.adviceText, { color: c.textPrimary }]}>
                    {advice.advice}
                  </Text>
                  <Text style={[styles.muted, { color: c.textMuted, marginTop: 8 }]}>
                    Based on your {advice.currency}{advice.monthly_savings.toFixed(0)}/mo savings · benchmark {advice.benchmark_pct}%
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.adviceText, { color: c.textPrimary, marginBottom: 10 }]}>
                    Get a personalized investment plan based on your salary, budget, and goals.
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: c.income }]}
                    onPress={fetchAdvice}
                    disabled={adviceLoading}
                  >
                    {adviceLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="bulb-outline" size={16} color="#fff" />
                        <Text style={styles.primaryBtnText}>Get AI Advice</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── Projection Calculator ── */}
            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>
              Projection Calculator
            </Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.calcRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Initial ({sym})</Text>
                  <TextInput
                    testID="invest-initial"
                    value={initial}
                    onChangeText={setInitial}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { color: c.textPrimary, backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Monthly ({sym})</Text>
                  <TextInput
                    testID="invest-monthly"
                    value={monthly}
                    onChangeText={setMonthly}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={c.textMuted}
                    style={[styles.input, { color: c.textPrimary, backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
                  />
                </View>
              </View>

              {/* Period chips */}
              <View style={[styles.periodRow, { marginTop: 12 }]}>
                {PERIOD_CHOICES.map((p) => (
                  <TouchableOpacity
                    key={p.months}
                    onPress={() => setPeriod(p.months)}
                    style={[
                      styles.periodPill,
                      { backgroundColor: period === p.months ? c.income : c.surfaceSecondary,
                        borderColor: period === p.months ? c.income : c.border },
                    ]}
                  >
                    <Text style={{
                      color: period === p.months ? '#fff' : c.textPrimary,
                      fontFamily: 'DMSans_500Medium', fontSize: 13,
                    }}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Chart */}
              {projLoading ? (
                <View style={{ marginTop: 16, paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator color={c.income} />
                </View>
              ) : projection ? (
                <>
                  <ProjectionChart
                    c={c} isDark={isDark}
                    isBr={isBr}
                    projection={projection}
                    width={chartWidth}
                    sym={sym}
                  />
                  <View style={{ marginTop: 14, gap: 8 }}>
                    <SummaryRow c={c} label="Total invested"   value={fmtMoney(projection.total_invested, sym)} tone="muted" />
                    <SummaryRow
                      c={c}
                      label={isBr ? 'CDB · Final amount' : 'HYSA · Final amount'}
                      value={fmtMoney(isBr ? projection.br.cdb.final_amount : projection.us.hysa.final_amount, sym)}
                      tone="income"
                    />
                    <SummaryRow
                      c={c}
                      label={isBr ? 'CDB · Earnings' : 'HYSA · Earnings'}
                      value={`+${fmtMoney(isBr ? projection.br.cdb.total_earnings : projection.us.hysa.total_earnings, sym)}`}
                      tone="income"
                    />
                    <Text style={[styles.muted, { color: c.textMuted, marginTop: 4 }]}>
                      Chart shows 3 strategies · tap refresh to update live rates
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={[styles.muted, { color: c.textMuted, marginTop: 12, textAlign: 'center' }]}>
                  Enter amounts above to see a projection
                </Text>
              )}
            </View>

            {/* ── Institutions ── */}
            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>
              {isBr ? 'Top Brazilian Institutions' : 'Top US Institutions'}
            </Text>
            <View style={[styles.safetyBanner, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={c.income}
              />
              <Text style={[styles.safetyText, { color: c.textPrimary }]}>
                {isBr
                  ? 'FGC protects up to R$250.000 per CPF per institution'
                  : 'FDIC insures up to $250,000 per depositor per bank'}
              </Text>
            </View>

            {institutions && institutions.length > 0 ? institutions.map((i, idx) => (
              <InstitutionCard
                key={`${i.name}-${idx}`}
                c={c}
                institution={i}
                onPress={() => openUrl(i.url)}
                sym={sym}
              />
            )) : (
              <Text style={[styles.muted, { color: c.textMuted, paddingVertical: 20, textAlign: 'center' }]}>
                Couldn't load institutions. Pull down to retry.
              </Text>
            )}

            <View style={{ height: 20 }} />
            <Text style={[styles.disclaimer, { color: c.textMuted }]}>
              ⚠️ Rates are reference values. Check with each institution for current offers.
              FinFlowAdvisors is not a registered advisor — information here is educational only.
            </Text>
            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function RateCard({ c, label, value, suffix, tone }: any) {
  const color = tone === 'income' ? c.income
              : tone === 'savings' ? c.savings
              : tone === 'warning' ? c.warning
              : c.textPrimary;
  return (
    <View style={[styles.rateCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.rateLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.rateValue, { color }]}>
        {value != null ? `${value.toFixed(2)}` : '—'}
      </Text>
      <Text style={[styles.rateSuffix, { color: c.textMuted }]}>{suffix}</Text>
    </View>
  );
}

function TreasuryPill({ c, label, value }: any) {
  return (
    <View style={[styles.treasuryPill, { backgroundColor: c.surfaceSecondary }]}>
      <Text style={[styles.treasuryPillLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.treasuryPillValue, { color: c.textPrimary }]}>
        {value != null ? `${value.toFixed(2)}%` : '—'}
      </Text>
    </View>
  );
}

function SummaryRow({ c, label, value, tone }: any) {
  const color = tone === 'income' ? c.income : tone === 'muted' ? c.textMuted : c.textPrimary;
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function ProjectionChart({ c, isDark, isBr, projection, width, sym }: any) {
  // Sample ~12 points to keep chart readable
  const sample = (series: Array<{ month: number; balance: number }>) => {
    const step = Math.max(1, Math.floor(series.length / 12));
    const out: number[] = [];
    for (let i = 0; i < series.length; i += step) out.push(series[i].balance);
    if (out.length && series[series.length - 1].balance !== out[out.length - 1]) {
      out.push(series[series.length - 1].balance);
    }
    return out;
  };

  const datasets = isBr
    ? [
        { key: 'CDB',       data: sample(projection.br.cdb.series),      color: () => c.income },
        { key: 'Tesouro',   data: sample(projection.br.tesouro.series),  color: () => c.savings },
        { key: 'Poupança',  data: sample(projection.br.poupanca.series), color: () => c.warning },
      ]
    : [
        { key: 'HYSA',      data: sample(projection.us.hysa.series),       color: () => c.income },
        { key: '10Y Treas.',data: sample(projection.us.ustreasury.series), color: () => c.savings },
        { key: 'Savings',   data: sample(projection.us.savings.series),    color: () => c.warning },
      ];

  const maxLen = Math.max(...datasets.map((d) => d.data.length));
  const labels = Array.from({ length: maxLen }, (_, i) => {
    const m = Math.round((i / (maxLen - 1 || 1)) * projection.period_months);
    return i % 2 === 0 ? (m >= 12 ? `${(m / 12).toFixed(0)}y` : `${m}m`) : '';
  });

  const chartConfig = {
    backgroundColor: c.surface,
    backgroundGradientFrom: c.surface,
    backgroundGradientTo: c.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => isDark ? `rgba(255,255,255,${opacity})` : `rgba(26,26,24,${opacity})`,
    labelColor: () => c.textMuted,
    propsForDots: { r: '2' },
    propsForBackgroundLines: { stroke: c.border },
  };

  return (
    <View style={{ marginTop: 16 }}>
      <LineChart
        data={{
          labels,
          datasets: datasets.map((d) => ({ data: d.data, color: d.color, strokeWidth: 2 })),
          legend: datasets.map((d) => d.key),
        }}
        width={width}
        height={200}
        chartConfig={chartConfig}
        bezier
        withShadow={false}
        withInnerLines={false}
        formatYLabel={(y) => {
          const n = parseFloat(y);
          return n >= 1000 ? `${sym}${(n / 1000).toFixed(0)}k` : `${sym}${n.toFixed(0)}`;
        }}
        style={{ marginLeft: -10 }}
      />
      {/* Custom legend since chart-kit doesn't style it well */}
      <View style={styles.legendRow}>
        {datasets.map((d) => (
          <View key={d.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: d.color() }]} />
            <Text style={[styles.legendText, { color: c.textPrimary }]}>{d.key}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InstitutionCard({ c, institution, onPress, sym }: { c: any; institution: Institution; onPress: () => void; sym: string }) {
  return (
    <View style={[styles.instCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.instHeader}>
        <Text style={styles.instEmoji}>{institution.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.instName, { color: c.textPrimary }]}>{institution.name}</Text>
          <Text style={[styles.instProduct, { color: c.textMuted }]}>{institution.product}</Text>
        </View>
        <View style={[styles.safetyBadge, { backgroundColor: c.income + '22', borderColor: c.income }]}>
          <Text style={[styles.safetyBadgeText, { color: c.income }]}>{institution.safety}</Text>
        </View>
      </View>

      <View style={styles.instMeta}>
        <View style={styles.instMetaCell}>
          <Text style={[styles.instMetaLabel, { color: c.textMuted }]}>Rate</Text>
          <Text style={[styles.instMetaValue, { color: c.income }]}>{institution.rate_label}</Text>
        </View>
        <View style={styles.instMetaCell}>
          <Text style={[styles.instMetaLabel, { color: c.textMuted }]}>Min invest</Text>
          <Text style={[styles.instMetaValue, { color: c.textPrimary }]}>
            {institution.min_amount > 0 ? `${sym}${institution.min_amount.toLocaleString()}` : 'None'}
          </Text>
        </View>
        <View style={styles.instMetaCell}>
          <Text style={[styles.instMetaLabel, { color: c.textMuted }]}>Liquidity</Text>
          <Text style={[styles.instMetaValue, { color: c.textPrimary }]}>{institution.liquidity}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.investBtn, { borderColor: c.income }]}
        onPress={onPress}
      >
        <Text style={[styles.investBtnText, { color: c.income }]}>Check current rate</Text>
        <Ionicons name="open-outline" size={14} color={c.income} />
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
  },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 22 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },

  countryRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 4,
    borderRadius: 10, padding: 4, gap: 4,
  },
  countryPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8,
  },
  countryEmoji: { fontSize: 18 },
  countryText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },

  scroll: { padding: 16, paddingBottom: 40 },

  sectionLabel: {
    fontFamily: 'DMSans_500Medium', fontSize: 12,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },

  rateGrid: { flexDirection: 'row', gap: 8 },
  rateCard: {
    flex: 1, borderRadius: 12, borderWidth: 0.5,
    paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center',
  },
  rateLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, marginBottom: 6 },
  rateValue: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  rateSuffix: { fontFamily: 'DMSans_400Regular', fontSize: 10, marginTop: 2 },

  treasuryRow: {
    marginTop: 10, borderRadius: 12, borderWidth: 0.5,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  treasuryLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase' },
  treasuryPills: { flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' },
  treasuryPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  treasuryPillLabel: { fontFamily: 'DMSans_500Medium', fontSize: 10 },
  treasuryPillValue: { fontFamily: 'DMSans_700Bold', fontSize: 13 },

  card: { borderRadius: 12, borderWidth: 0.5, padding: 16 },
  muted: { fontFamily: 'DMSans_400Regular', fontSize: 12 },

  // Calc
  calcRow: { flexDirection: 'row' },
  fieldLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' },
  input: {
    borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: 'DMSans_600SemiBold', fontSize: 16,
  },
  periodRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  periodPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 9999, borderWidth: 0.5,
  },

  legendRow: {
    flexDirection: 'row', gap: 16, flexWrap: 'wrap',
    justifyContent: 'center', marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: 'DMSans_500Medium', fontSize: 12 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  summaryValue: { fontFamily: 'DMSans_700Bold', fontSize: 15 },

  // Advice
  adviceBucket: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  adviceText: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 14 },

  // Safety
  safetyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 0.5, padding: 10, marginBottom: 12,
  },
  safetyText: { fontFamily: 'DMSans_500Medium', fontSize: 12, flex: 1 },

  // Institution card
  instCard: { borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 10 },
  instHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  instEmoji: { fontSize: 22 },
  instName: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  instProduct: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 1 },
  safetyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  safetyBadgeText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },

  instMeta: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  instMetaCell: { flex: 1 },
  instMetaLabel: { fontFamily: 'DMSans_500Medium', fontSize: 10, textTransform: 'uppercase', marginBottom: 2 },
  instMetaValue: { fontFamily: 'DMSans_700Bold', fontSize: 13 },

  investBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 8, borderWidth: 1,
  },
  investBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 13 },

  disclaimer: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
