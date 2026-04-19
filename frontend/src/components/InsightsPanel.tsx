import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors } from '../theme';
import { useI18n } from '../i18n';
import { getInsights, InsightsResponse } from '../api';

const RISK_COLORS: Record<string, string> = {
  low: '#2d5a3d',
  medium: '#b8740a',
  high: '#c84b1f',
  unknown: '#6b7280',
};

const LEAK_ICONS: Record<string, any> = {
  creep: 'trending-up-outline',
  subscription: 'refresh-outline',
  duplicate: 'copy-outline',
  price_increase: 'arrow-up-circle-outline',
};

function fmt(n: number, currency: string): string {
  const v = Math.round(n);
  return `${currency}${v.toLocaleString()}`;
}

type Props = { refreshKey?: number };

export function InsightsPanel({ refreshKey }: Props) {
  const c = useThemeColors();
  const { t } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await getInsights();
      setData(d);
    } catch (e) {
      // silent fail - insights is an enhancement
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <ActivityIndicator color={c.income} />
      </View>
    );
  }

  if (!data) return null;

  const { forecast, leaks, total_leak_savings, personality, weekly_report, currency } = data;

  const riskColor = RISK_COLORS[forecast.risk_level] || c.textMuted;
  const riskLabel =
    forecast.risk_level === 'low' ? t('dashboard.riskLow')
    : forecast.risk_level === 'medium' ? t('dashboard.riskMedium')
    : forecast.risk_level === 'high' ? t('dashboard.riskHigh')
    : t('dashboard.riskUnknown');

  return (
    <>
      {/* ── FORECAST + PERSONALITY COMBINED CARD ── */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="compass-outline" size={16} color={c.income} />
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('dashboard.forecast')}</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.riskPill, { backgroundColor: riskColor + '22', borderColor: riskColor }]}>
            <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
            <Text style={[styles.riskText, { color: riskColor }]}>{riskLabel}</Text>
          </View>
        </View>
        <Text style={[styles.riskReason, { color: c.textMuted }]}>{forecast.risk_reason}</Text>

        <View style={styles.forecastGrid}>
          <View style={styles.forecastCell}>
            <Text style={[styles.forecastLabel, { color: c.textMuted }]}>
              {forecast.runway_days >= 999 ? '—' : t('dashboard.runwayDays', { n: forecast.runway_days })}
            </Text>
            <Text style={[styles.forecastValue, { color: c.textPrimary }]}>
              {fmt(forecast.discretionary_remaining, currency)}
            </Text>
          </View>
          <View style={styles.forecastCell}>
            <Text style={[styles.forecastLabel, { color: c.textMuted }]}>{t('dashboard.projectedBalance')}</Text>
            <Text style={[
              styles.forecastValue,
              { color: forecast.projected_end_balance >= 0 ? c.income : c.expense },
            ]}>
              {fmt(forecast.projected_end_balance, currency)}
            </Text>
          </View>
        </View>

        {/* Personality inline */}
        <View style={[styles.personalityRow, { borderTopColor: c.border }]}>
          <Text style={{ fontSize: 22 }}>{personality.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.personalityLabel, { color: personality.color }]}>
              {personality.label}
            </Text>
            <Text style={[styles.personalityDesc, { color: c.textMuted }]} numberOfLines={2}>
              {personality.description}
            </Text>
          </View>
        </View>
      </View>

      {/* ── MONEY LEAKS ── */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="water-outline" size={16} color={c.expense} />
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('dashboard.moneyLeaks')}</Text>
          {total_leak_savings > 0 && (
            <>
              <View style={{ flex: 1 }} />
              <Text style={[styles.savingsPill, { color: c.income }]}>
                {t('dashboard.potentialSavings')}: {fmt(total_leak_savings, currency)}
              </Text>
            </>
          )}
        </View>

        {leaks.length === 0 ? (
          <Text style={[styles.emptyLeaks, { color: c.textMuted }]}>{t('dashboard.noLeaks')}</Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {leaks.map((leak, idx) => (
              <View
                key={idx}
                style={[
                  styles.leakRow,
                  { borderBottomColor: c.border, borderBottomWidth: idx < leaks.length - 1 ? 0.5 : 0 },
                ]}
              >
                <View style={[
                  styles.leakIconWrap,
                  { backgroundColor: (leak.severity === 'high' ? c.expense : leak.severity === 'medium' ? c.warning : c.income) + '22' },
                ]}>
                  <Ionicons
                    name={LEAK_ICONS[leak.type] || 'alert-circle-outline'}
                    size={16}
                    color={leak.severity === 'high' ? c.expense : leak.severity === 'medium' ? c.warning : c.income}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.leakTitle, { color: c.textPrimary }]}>{leak.title}</Text>
                  <Text style={[styles.leakDesc, { color: c.textMuted }]} numberOfLines={2}>
                    {leak.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── WEEKLY REPORT + WHAT-IF BUTTON ROW ── */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 12 }]}>
        <View style={styles.weekRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="calendar-outline" size={14} color={c.income} />
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('dashboard.weekReport')}</Text>
            </View>
            <Text style={[styles.weekValue, { color: c.textPrimary }]}>
              {fmt(weekly_report.week_total, currency)} {t('dashboard.weekSpent')}
            </Text>
            {weekly_report.prior_week_total > 0 && (
              <Text style={[
                styles.weekChange,
                { color: weekly_report.change_pct >= 0 ? c.expense : c.income },
              ]}>
                {weekly_report.change_pct >= 0 ? '▲' : '▼'} {Math.abs(weekly_report.change_pct)}% {t('dashboard.weekVsPrior')}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.simBtn, { backgroundColor: c.income }]}
            onPress={() => router.push('/simulator' as any)}
          >
            <Ionicons name="beaker-outline" size={16} color="#fff" />
            <Text style={styles.simBtnText}>{t('dashboard.scenario')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 12,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: {
    fontFamily: 'DMSans_600SemiBold', fontSize: 13,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  riskPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
  },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
  riskText: { fontFamily: 'DMSans_600SemiBold', fontSize: 10, textTransform: 'uppercase' },
  riskReason: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 6 },

  forecastGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  forecastCell: { flex: 1 },
  forecastLabel: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 15 },
  forecastValue: { fontFamily: 'DMSans_700Bold', fontSize: 18, marginTop: 4 },

  personalityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 0.5, paddingTop: 12, marginTop: 12,
  },
  personalityLabel: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  personalityDesc: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },

  savingsPill: { fontFamily: 'DMSans_600SemiBold', fontSize: 11 },

  emptyLeaks: {
    fontFamily: 'DMSans_400Regular', fontSize: 13,
    textAlign: 'center', paddingVertical: 14,
  },
  leakRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10,
  },
  leakIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  leakTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
  leakDesc: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },

  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekValue: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 4 },
  weekChange: { fontFamily: 'DMSans_500Medium', fontSize: 11, marginTop: 2 },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
  },
  simBtnText: { color: '#fff', fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
});
