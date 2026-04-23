import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme';
import { getImmuneScore, ImmuneScore, ImmuneFactor } from '../api';

type Props = { refreshKey?: number };

const formatMoney = (n: number | undefined, cur: string) =>
  n == null ? '—' : `${cur}${Math.round(n).toLocaleString()}`;

export function ImmuneScoreCard({ refreshKey }: Props) {
  const c = useThemeColors();
  const [data, setData] = useState<ImmuneScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await getImmuneScore();
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator size="small" color={c.income} />
          <Text style={[styles.loadingText, { color: c.textMuted }]}>Calculating your financial health…</Text>
        </View>
      </View>
    );
  }

  if (!data) {
    return null; // silently hide on error
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded((e) => !e)}
      style={[styles.card, { backgroundColor: c.surface, borderColor: data.color }]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.shieldBubble, { backgroundColor: data.color + '22' }]}>
          <Ionicons name="shield-checkmark" size={20} color={data.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.textMuted }]}>Financial Immune Score</Text>
          <Text style={[styles.level, { color: data.color }]}>{data.level}</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={[styles.scoreValue, { color: data.color }]}>{data.score}</Text>
          <Text style={[styles.scoreOutOf, { color: c.textMuted }]}>/100</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18} color={c.textMuted}
          style={{ marginLeft: 6 }}
        />
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: c.surfaceSecondary }]}>
        <View style={[styles.progressFill, { width: `${data.score}%`, backgroundColor: data.color }]} />
      </View>

      <Text style={[styles.description, { color: c.textPrimary }]}>{data.description}</Text>

      {/* Expanded detail */}
      {expanded && (
        <View style={{ marginTop: 14 }}>
          <FactorRow
            c={c}
            factor={data.factors.emergency_fund}
            detail={
              data.factors.emergency_fund.months_covered != null
                ? `${data.factors.emergency_fund.months_covered} months covered · ${formatMoney(data.factors.emergency_fund.total_liquid, data.currency)}`
                : undefined
            }
          />
          <FactorRow
            c={c}
            factor={data.factors.obligation_ratio}
            detail={
              data.factors.obligation_ratio.pct != null
                ? `${data.factors.obligation_ratio.pct}% of income · ${formatMoney(data.factors.obligation_ratio.total_obligations, data.currency)}/mo`
                : undefined
            }
          />
          <FactorRow
            c={c}
            factor={data.factors.savings_rate}
            detail={
              data.factors.savings_rate.pct != null
                ? `${data.factors.savings_rate.pct}% saving rate · ${formatMoney(data.factors.savings_rate.net, data.currency)} net`
                : undefined
            }
          />

          {data.tips.length > 0 && (
            <View style={[styles.tipsBox, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="bulb-outline" size={14} color={data.color} />
                <Text style={[styles.tipsHeader, { color: c.textPrimary }]}>Recommended actions</Text>
              </View>
              {data.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={[styles.tipBullet, { color: data.color }]}>•</Text>
                  <Text style={[styles.tipText, { color: c.textPrimary }]}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function FactorRow({ c, factor, detail }: { c: any; factor: ImmuneFactor; detail?: string }) {
  const pct = (factor.score / factor.max) * 100;
  const color = pct >= 80 ? c.income : pct >= 50 ? c.warning : c.expense;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.factorTop}>
        <Text style={[styles.factorLabel, { color: c.textPrimary }]}>{factor.label}</Text>
        <Text style={[styles.factorScore, { color }]}>
          {factor.score}<Text style={{ color: c.textMuted }}>/{factor.max}</Text>
        </Text>
      </View>
      <View style={[styles.factorTrack, { backgroundColor: c.surfaceSecondary }]}>
        <View style={[styles.factorFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      {detail ? <Text style={[styles.factorDetail, { color: c.textMuted }]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  loadingText: { fontFamily: 'DMSans_500Medium', fontSize: 13 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shieldBubble: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  level: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 2 },

  scoreBox: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreValue: { fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 32 },
  scoreOutOf: { fontFamily: 'DMSans_500Medium', fontSize: 12, marginBottom: 6, marginLeft: 2 },

  progressTrack: { height: 6, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  description: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 10 },

  factorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  factorLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 13 },
  factorScore: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  factorTrack: { height: 4, borderRadius: 3, overflow: 'hidden' },
  factorFill: { height: '100%', borderRadius: 3 },
  factorDetail: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 4 },

  tipsBox: { borderRadius: 10, borderWidth: 0.5, padding: 10, marginTop: 4 },
  tipsHeader: { fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
  tipRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tipBullet: { fontFamily: 'DMSans_700Bold', fontSize: 14, marginTop: -2 },
  tipText: { fontFamily: 'DMSans_400Regular', fontSize: 12, flex: 1, lineHeight: 16 },
});
