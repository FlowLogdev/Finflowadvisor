import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import {
  getSubscriptionGraveyard, toggleSubscriptionUnused,
  GraveyardSubscription, GraveyardResponse,
} from '../src/api';

export default function GraveyardScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [data, setData] = useState<GraveyardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSubscriptionGraveyard();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (sub: GraveyardSubscription) => {
    const action = sub.is_buried ? 'resurrect' : 'bury';
    Alert.alert(
      sub.is_buried ? 'Resurrect Subscription?' : 'Mark as Unused?',
      sub.is_buried
        ? `Mark "${sub.name}" as active again?`
        : `Mark "${sub.name}" as unused? It will appear in your graveyard.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'bury' ? '⚰️ Bury It' : '↩ Resurrect',
          onPress: async () => {
            try {
              const res = await toggleSubscriptionUnused(sub.id);
              setData((prev) => {
                if (!prev) return prev;
                const updated = prev.subscriptions.map((s) =>
                  s.id === sub.id ? { ...s, marked_unused: res.marked_unused, is_buried: res.marked_unused } : s
                );
                const waste = updated.filter((s) => s.is_buried).reduce((sum, s) => sum + s.monthly_cost, 0);
                return {
                  ...prev,
                  subscriptions: updated.sort((a, b) => Number(b.is_buried) - Number(a.is_buried) || b.monthly_cost - a.monthly_cost),
                  total_waste_monthly: waste,
                  total_waste_annual: waste * 12,
                };
              });
            } catch (e) {
              Alert.alert('Error', 'Could not update subscription');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.expense} />
      </SafeAreaView>
    );
  }

  const cur = data?.currency || '$';
  const buried = data?.subscriptions.filter((s) => s.is_buried) || [];
  const active = data?.subscriptions.filter((s) => !s.is_buried) || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color={c.textMuted} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.title, { color: c.textPrimary }]}>⚰️ Subscription Graveyard</Text>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>Money buried in forgotten subs</Text>
          </View>
        </View>

        {/* Summary stats */}
        <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.statRow}>
            <StatBox label="Monthly Total" value={`${cur}${(data?.total_monthly || 0).toLocaleString()}`} color={c.textPrimary} c={c} />
            <StatBox label="Annual Total" value={`${cur}${(data?.total_annual || 0).toLocaleString()}`} color={c.warning} c={c} />
          </View>
          {(data?.total_waste_monthly || 0) > 0 && (
            <View style={[styles.wasteAlert, { backgroundColor: c.expense + '18', borderColor: c.expense }]}>
              <Ionicons name="skull-outline" size={18} color={c.expense} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.wasteTitle, { color: c.expense }]}>
                  {cur}{data?.total_waste_monthly.toLocaleString()}/mo wasted
                </Text>
                <Text style={[styles.wasteDesc, { color: c.textMuted }]}>
                  That's {cur}{data?.total_waste_annual.toLocaleString()}/year on subs you don't use
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Buried (unused) subscriptions */}
        {buried.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: c.expense }]}>⚰️ Buried ({buried.length})</Text>
            {buried.map((sub) => (
              <Tombstone key={sub.id} sub={sub} cur={cur} c={c} onToggle={handleToggle} />
            ))}
          </>
        )}

        {/* Active subscriptions */}
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
          Active ({active.length})
        </Text>
        {active.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              No subscriptions found.{'\n'}Add bills under the "Subscriptions" category or mark expenses as recurring.
            </Text>
          </View>
        ) : (
          active.map((sub) => (
            <SubCard key={sub.id} sub={sub} cur={cur} c={c} onToggle={handleToggle} />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Tombstone({ sub, cur, c, onToggle }: {
  sub: GraveyardSubscription; cur: string; c: any; onToggle: (s: GraveyardSubscription) => void;
}) {
  return (
    <View style={[styles.tombstone, { backgroundColor: c.surfaceSecondary, borderColor: c.expense }]}>
      <View style={styles.tombTop}>
        <Text style={styles.tombEmoji}>🪦</Text>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.tombName, { color: c.textPrimary }]}>{sub.name}</Text>
          <Text style={[styles.tombCat, { color: c.textMuted }]}>{sub.category}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.tombCost, { color: c.expense }]}>{cur}{sub.monthly_cost}/mo</Text>
          <Text style={[styles.tombWasted, { color: c.textMuted }]}>
            {cur}{sub.cumulative_cost.toLocaleString()} wasted
          </Text>
        </View>
      </View>
      <View style={[styles.tombDivider, { backgroundColor: c.border }]} />
      <View style={styles.tombBottom}>
        <Text style={[styles.tombEpitaph, { color: c.textMuted }]}>
          R.I.P. · {sub.months_active} months of payments
        </Text>
        <TouchableOpacity
          onPress={() => onToggle(sub)}
          style={[styles.resurrectBtn, { borderColor: c.textMuted }]}
        >
          <Text style={[styles.resurrectText, { color: c.textMuted }]}>↩ Resurrect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SubCard({ sub, cur, c, onToggle }: {
  sub: GraveyardSubscription; cur: string; c: any; onToggle: (s: GraveyardSubscription) => void;
}) {
  return (
    <View style={[styles.subCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.subRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.subName, { color: c.textPrimary }]}>{sub.name}</Text>
          <Text style={[styles.subMeta, { color: c.textMuted }]}>
            {sub.category} · {cur}{sub.cumulative_cost.toLocaleString()} total paid
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
          <Text style={[styles.subCost, { color: c.textPrimary }]}>{cur}{sub.monthly_cost}/mo</Text>
          <Text style={[styles.subAnnual, { color: c.textMuted }]}>{cur}{(sub.monthly_cost * 12).toLocaleString()}/yr</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => onToggle(sub)}
        style={[styles.buryBtn, { backgroundColor: c.surfaceSecondary }]}
      >
        <Text style={[styles.buryText, { color: c.expense }]}>⚰️ Mark as Unused</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatBox({ label, value, color, c }: { label: string; value: string; color: string; c: any }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 22 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 2 },
  sectionTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 16, marginBottom: 10, marginTop: 8 },

  summaryCard: { borderRadius: 14, borderWidth: 0.5, padding: 16, marginBottom: 20 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statBox: { flex: 1 },
  statLabel: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 4 },
  statValue: { fontFamily: 'DMMono_500Medium', fontSize: 18 },
  wasteAlert: { borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center' },
  wasteTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  wasteDesc: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },

  // Tombstone
  tombstone: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', padding: 14, marginBottom: 12 },
  tombTop: { flexDirection: 'row', alignItems: 'center' },
  tombEmoji: { fontSize: 28 },
  tombName: { fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
  tombCat: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  tombCost: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
  tombWasted: { fontFamily: 'DMMono_400Regular', fontSize: 11, marginTop: 2 },
  tombDivider: { height: 1, marginVertical: 10 },
  tombBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tombEpitaph: { fontFamily: 'DMSans_400Regular', fontSize: 12, fontStyle: 'italic' },
  resurrectBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  resurrectText: { fontFamily: 'DMSans_500Medium', fontSize: 12 },

  // Active sub card
  subCard: { borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 10 },
  subRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  subName: { fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
  subMeta: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  subCost: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
  subAnnual: { fontFamily: 'DMMono_400Regular', fontSize: 11, marginTop: 2 },
  buryBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  buryText: { fontFamily: 'DMSans_600SemiBold', fontSize: 13 },

  emptyCard: { borderRadius: 14, borderWidth: 0.5, padding: 20, alignItems: 'center' },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
